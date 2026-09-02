// SPDX-License-Identifier: Apache-2.0
// The agent loop against a fake provider: leases, ledger causes, budgets, kill.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, Settings, FS, Leases, Ledger, Vault, on } from "../os/desktop/js/core.js";
import { Agents, TOOLS, systemPrompt } from "../os/desktop/js/agent.js";

/* A fake OpenAI-compatible server: each call pops the next scripted reply.
 * A reply is either a string (plain text) or [name, input] (one tool call). */
function fakeOS(script, grant) {
	const store = new Store();
	const ledger = new Ledger(store);
	const fs = new FS(store, ledger).init();
	const settings = new Settings(store);
	settings.set({ provider: "openai", model: "gpt-5", budgetTokens: 1000 });
	const vault = new Vault(store);
	vault.set("openai", "k");
	const requests = [];
	const fetch = async (url, init) => {
		requests.push(JSON.parse(init.body));
		const next = script.shift();
		let body;
		if (typeof next === "string") {
			body = `data: ${JSON.stringify({ choices: [{ delta: { content: next }, finish_reason: "stop" }] })}\n\n`;
		} else {
			const [name, input] = next;
			body = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c" + requests.length, function: { name, arguments: JSON.stringify(input) } }] }, finish_reason: "tool_calls" }] })}\n\n`;
		}
		body += `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 50 } })}\n\ndata: [DONE]\n\n`;
		return new Response(body, { status: 200 });
	};
	const asked = [];
	const os = {
		store, fs, ledger, settings, vault, leases: new Leases(), fetch, requests, asked,
		kernel: { attached: false, eval: async () => { throw new Error("kernel not attached"); } },
		shell: (line) => "ran: " + line,
		snapshot: async (name) => ({ name, root: "abc" }),
		ui: { askLease: async (agent, scope) => { asked.push(scope); return grant(agent, scope, os); }, notify() {}, open() {} },
	};
	os.agents = new Agents(os);
	return os;
}

test("an agent reads a file only after a lease is granted, and the write names its cause", async () => {
	const os = fakeOS([
		["fs_read", { path: "/etc/motd" }],
		["fs_write", { path: "/home/agents/note.txt", content: "seen" }],
		"done",
	], (agent, scope, os) => os.leases.grant(agent.subject, scope, 60000));
	const a = os.agents.spawn({ name: "t" });
	await a.send("read motd and note it");
	assert.equal(a.state, "idle");
	assert.deepEqual(os.asked, ["fs.read", "fs.write"], "one ask per scope");
	assert.equal(os.fs.read("/home/agents/note.txt"), "seen");
	assert.equal(a.messages.length, 6, "user, tool, result, tool, result, final");
	assert.equal(a.messages[2].content[0].content, "authority expires. the system is a graph you can hash.\n");

	const tool = os.ledger.all().find((e) => e.kind === "tool" && e.tool === "fs_write");
	const write = os.ledger.all().find((e) => e.kind === "fs.write" && e.path === "/home/agents/note.txt");
	assert.equal(write.cause, tool.seq, "the file change points at the tool call that caused it");
	assert.equal(write.actor, a.subject);
	assert.equal(a.usage.input, 300);
	assert.equal(a.usage.output, 150);
	assert.ok(os.requests[0].tools.length === TOOLS.length);
	assert.match(os.requests[0].messages[0].content, /no permissions/);
});

test("a denied lease becomes an error result the model sees, not an exception", async () => {
	const os = fakeOS([["fs_delete", { path: "/home/README.md" }], "ok, leaving it"], () => null);
	const a = os.agents.spawn({});
	await a.send("delete my readme");
	assert.ok(os.fs.exists("/home/README.md"));
	const r = a.messages[2].content[0];
	assert.equal(r.is_error, true);
	assert.match(r.content, /permission denied/);
	assert.ok(os.ledger.all().some((e) => e.kind === "tool.denied"));
	assert.equal(a.state, "idle");
});

test("the budget pauses an agent and resume continues it", async () => {
	const os = fakeOS([["fs_list", {}], ["fs_list", {}], "fin"], (agent, scope, os) => os.leases.grant("*", "*", 60000));
	const a = os.agents.spawn({ budget: 200 });
	await a.send("list twice");
	assert.equal(a.state, "paused");
	assert.match(a.reason, /budget/);
	a.budget = 10000;
	await a.resume();
	assert.equal(a.state, "idle");
	assert.equal(a.messages.at(-1).content[0].text, "fin");
});

test("a kill mid-run stops the loop and drops the agent's leases", async () => {
	const os = fakeOS([["shell_run", { command: "ls" }], "never"], async (agent, scope, os) => {
		agent.kill();
		return os.leases.grant(agent.subject, scope, 60000);
	});
	const a = os.agents.spawn({});
	await a.send("go");
	assert.equal(a.state, "killed");
	assert.equal(os.leases.list().length, 0);
	await assert.rejects(() => a.send("again"), /killed/);
});

test("a provider error pauses the agent with the message", async () => {
	const os = fakeOS([], () => null);
	os.fetch = async () => new Response('{"error":{"message":"rate limited"}}', { status: 429, statusText: "Too Many" });
	const a = os.agents.spawn({});
	let err = "";
	on("agent", (d) => { if (d.kind === "error") err = d.error; });
	await a.send("hi");
	assert.equal(a.state, "paused");
	assert.match(err, /429.*rate limited/);
});

test("system prompt mentions the kernel state and the digest", () => {
	const os = fakeOS([], () => null);
	os.digest = "abcdef0123456789abcdef";
	const a = os.agents.spawn({ name: "N" });
	const s = systemPrompt(os, a);
	assert.match(s, /process "N"/);
	assert.match(s, /abcdef0123456789…/);
	assert.match(s, /not attached/);
});
