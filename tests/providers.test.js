// SPDX-License-Identifier: Apache-2.0
// Provider request shaping and stream parsing, against recorded event shapes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequest, makeParser, sseDecoder, stream, byId, userMsg } from "../os/desktop/js/providers.js";

const tools = [{ name: "fs_read", description: "read", input_schema: { properties: { path: { type: "string" } }, required: ["path"] } }];
const convo = [
	userMsg("read /etc/motd"),
	{ role: "assistant", content: [{ type: "text", text: "Reading." }, { type: "tool_use", id: "t1", name: "fs_read", input: { path: "/etc/motd" } }] },
	{ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", name: "fs_read", content: "hello" }] },
];

test("anthropic request: headers, tools, tool results, optional fallbacks", () => {
	const r = buildRequest(byId("anthropic"), { key: "sk", model: "claude-opus-5", system: "sys", messages: convo, tools });
	assert.equal(r.url, "https://api.anthropic.com/v1/messages");
	assert.equal(r.headers["x-api-key"], "sk");
	assert.equal(r.headers["anthropic-version"], "2023-06-01");
	assert.equal(r.headers["anthropic-dangerous-direct-browser-access"], "true");
	assert.equal(r.headers["anthropic-beta"], undefined);
	assert.equal(r.body.system, "sys");
	assert.equal(r.body.stream, true);
	assert.deepEqual(r.body.tools[0], { name: "fs_read", description: "read", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } });
	const tr = r.body.messages[2].content[0];
	assert.deepEqual(tr, { type: "tool_result", tool_use_id: "t1", content: "hello" }, "name is stripped for the wire");
	assert.equal(r.body.thinking, undefined, "adaptive thinking is the default; nothing is sent");

	const f = buildRequest(byId("anthropic"), { key: "sk", model: "claude-opus-5", messages: convo, fallbacks: true });
	assert.equal(f.headers["anthropic-beta"], "server-side-fallback-2026-07-01");
	assert.equal(f.body.fallbacks, "default");
});

test("openai request: system first, tool_calls and tool role, custom base", () => {
	const r = buildRequest(byId("groq"), { key: "gsk", model: "m", system: "sys", messages: convo, tools });
	assert.equal(r.url, "https://api.groq.com/openai/v1/chat/completions");
	assert.equal(r.headers.authorization, "Bearer gsk");
	assert.deepEqual(r.body.messages[0], { role: "system", content: "sys" });
	assert.deepEqual(r.body.messages[2].tool_calls, [{ id: "t1", type: "function", function: { name: "fs_read", arguments: '{"path":"/etc/motd"}' } }]);
	assert.deepEqual(r.body.messages[3], { role: "tool", tool_call_id: "t1", content: "hello" });
	assert.deepEqual(r.body.stream_options, { include_usage: true });
	assert.equal(r.body.tools[0].type, "function");

	const o = buildRequest(byId("ollama"), { key: "", model: "llama3.2", messages: convo, base: "http://box:11434/v1/" });
	assert.equal(o.url, "http://box:11434/v1/chat/completions");
	assert.equal(o.headers.authorization, undefined, "no key for a local server");
	assert.equal(o.body.stream_options, undefined, "local servers may not accept it");
});

test("gemini request: roles, functionCall and functionResponse", () => {
	const r = buildRequest(byId("google"), { key: "g", model: "gemini-2.5-pro", system: "sys", messages: convo, tools });
	assert.equal(r.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse");
	assert.equal(r.headers["x-goog-api-key"], "g");
	assert.deepEqual(r.body.systemInstruction, { parts: [{ text: "sys" }] });
	assert.equal(r.body.contents[1].role, "model");
	assert.deepEqual(r.body.contents[1].parts[1], { functionCall: { name: "fs_read", args: { path: "/etc/motd" } } });
	assert.deepEqual(r.body.contents[2].parts[0], { functionResponse: { name: "fs_read", response: { result: "hello" } } });
	assert.equal(r.body.tools[0].functionDeclarations[0].name, "fs_read");
});

test("anthropic stream parses text, a tool call, usage and stop", () => {
	const p = makeParser("anthropic");
	const ev = [];
	const feed = (d) => ev.push(...p.feed(d));
	feed({ type: "message_start", message: { usage: { input_tokens: 12 } } });
	feed({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
	feed({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } });
	feed({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } });
	feed({ type: "content_block_stop", index: 0 });
	feed({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "fs_read", input: {} } });
	feed({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"pa' } });
	feed({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'th":"/x"}' } });
	feed({ type: "content_block_stop", index: 1 });
	feed({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 30 } });
	ev.push(...p.end());
	assert.deepEqual(ev, [
		{ type: "usage", input: 12, output: 0 },
		{ type: "text", text: "Hel" }, { type: "text", text: "lo" },
		{ type: "tool", id: "toolu_1", name: "fs_read", input: { path: "/x" } },
		{ type: "usage", input: 0, output: 30 },
		{ type: "stop", reason: "tool_use", details: undefined },
	]);
});

test("openai stream assembles split tool_calls and reports usage", () => {
	const p = makeParser("openai");
	const ev = [];
	ev.push(...p.feed({ choices: [{ delta: { content: "ok " } }] }));
	ev.push(...p.feed({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_9", function: { name: "fs_", arguments: "" } }] } }] }));
	ev.push(...p.feed({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "read", arguments: '{"path":' } }] } }] }));
	ev.push(...p.feed({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"/y"}' } }] }, finish_reason: "tool_calls" }] }));
	ev.push(...p.feed({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 7 } }));
	ev.push(...p.end());
	assert.deepEqual(ev, [
		{ type: "text", text: "ok " },
		{ type: "usage", input: 5, output: 7, absolute: true },
		{ type: "tool", id: "call_9", name: "fs_read", input: { path: "/y" } },
		{ type: "stop", reason: "tool_use" },
	]);
	const q = makeParser("openai");
	q.feed({ choices: [{ delta: { content: "done" }, finish_reason: "stop" }] });
	assert.deepEqual(q.end(), [{ type: "stop", reason: "end_turn" }]);
});

test("gemini stream: parts, invented call ids, finish reason", () => {
	const p = makeParser("gemini");
	const ev = [
		...p.feed({ candidates: [{ content: { parts: [{ text: "Sure." }, { functionCall: { name: "fs_read", args: { path: "/z" } } }] } }] }),
		...p.feed({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 } }),
	];
	assert.deepEqual(ev, [
		{ type: "text", text: "Sure." },
		{ type: "tool", id: "call_1", name: "fs_read", input: { path: "/z" } },
		{ type: "usage", input: 3, output: 4, absolute: true },
		{ type: "stop", reason: "end_turn" },
	]);
});

test("sse decoder handles split frames and [DONE]", () => {
	const d = sseDecoder();
	assert.deepEqual(d.push('event: x\ndata: {"a":1}\n\nda'), ['{"a":1}']);
	assert.deepEqual(d.push('ta: {"b":2}\n\ndata: [DONE]\n\n'), ['{"b":2}']);
});

test("stream(): end to end over a fake fetch, and errors carry the server message", async () => {
	const body = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
	const fakeFetch = async (url, init) => {
		assert.equal(url, "https://api.openai.com/v1/chat/completions");
		assert.equal(JSON.parse(init.body).model, "gpt-5");
		return new Response(body, { status: 200 });
	};
	const out = [];
	for await (const ev of stream(byId("openai"), { key: "k", model: "gpt-5", messages: [userMsg("hi")] }, fakeFetch)) out.push(ev);
	assert.deepEqual(out, [{ type: "text", text: "hi" }, { type: "stop", reason: "end_turn" }]);

	const bad = async () => new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401, statusText: "Unauthorized" });
	await assert.rejects(async () => { for await (const _ of stream(byId("anthropic"), { key: "k", model: "m", messages: [userMsg("hi")] }, bad)) void _; }, /401 Unauthorized: invalid x-api-key/);
});
