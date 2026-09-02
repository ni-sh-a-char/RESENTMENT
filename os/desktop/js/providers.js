/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - model providers.
 *
 * Bring your own key. Every provider is reduced to one internal shape:
 * messages are lists of content blocks (text, tool_use, tool_result), a
 * request is {url, headers, body}, and a stream is a sequence of small
 * events - text, tool, usage, stop. Three wire formats cover everything
 * anyone sells today:
 *
 *   anthropic   the Messages API
 *   openai      /chat/completions, which every other vendor and every local
 *               server (Ollama, LM Studio, vLLM, llama.cpp) also speaks
 *   gemini      generateContent
 *
 * The functions that build requests and parse events are pure, so the
 * tests can run them under Node against recorded streams and the browser
 * only adds fetch.
 */

export const PROVIDERS = [
	{ id: "anthropic", name: "Anthropic", kind: "anthropic", base: "https://api.anthropic.com",
	  models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
	  keys: "https://console.anthropic.com/settings/keys" },
	{ id: "openai", name: "OpenAI", kind: "openai", base: "https://api.openai.com/v1",
	  models: ["gpt-5", "gpt-5-mini", "gpt-4.1"],
	  keys: "https://platform.openai.com/api-keys" },
	{ id: "google", name: "Google Gemini", kind: "gemini", base: "https://generativelanguage.googleapis.com/v1beta",
	  models: ["gemini-2.5-pro", "gemini-2.5-flash"],
	  keys: "https://aistudio.google.com/apikey" },
	{ id: "groq", name: "Groq", kind: "openai", base: "https://api.groq.com/openai/v1",
	  models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
	  keys: "https://console.groq.com/keys" },
	{ id: "mistral", name: "Mistral", kind: "openai", base: "https://api.mistral.ai/v1",
	  models: ["mistral-large-latest", "mistral-small-latest"],
	  keys: "https://console.mistral.ai/api-keys" },
	{ id: "xai", name: "xAI", kind: "openai", base: "https://api.x.ai/v1",
	  models: ["grok-4"], keys: "https://console.x.ai" },
	{ id: "deepseek", name: "DeepSeek", kind: "openai", base: "https://api.deepseek.com/v1",
	  models: ["deepseek-chat", "deepseek-reasoner"], keys: "https://platform.deepseek.com/api_keys" },
	{ id: "openrouter", name: "OpenRouter", kind: "openai", base: "https://openrouter.ai/api/v1",
	  models: ["anthropic/claude-sonnet-5", "openai/gpt-5", "google/gemini-2.5-pro"],
	  keys: "https://openrouter.ai/keys",
	  headers: { "HTTP-Referer": "https://ni-sh-a-char.github.io/RESENTMENT/", "X-Title": "RESENTMENT OS" } },
	{ id: "together", name: "Together", kind: "openai", base: "https://api.together.xyz/v1",
	  models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"], keys: "https://api.together.xyz/settings/api-keys" },
	{ id: "ollama", name: "Ollama (local)", kind: "openai", base: "http://localhost:11434/v1",
	  models: ["llama3.2", "qwen2.5", "gemma3"], local: true, usage: false,
	  note: "Start Ollama with OLLAMA_ORIGINS=* so a browser page may call it. No key needed." },
	{ id: "lmstudio", name: "LM Studio (local)", kind: "openai", base: "http://localhost:1234/v1",
	  models: [], local: true, usage: false, note: "Enable CORS in the LM Studio server settings. No key needed." },
	{ id: "custom", name: "Any OpenAI-compatible server", kind: "openai", base: "",
	  models: [], note: "vLLM, llama.cpp, LiteLLM, a proxy of your own. Set the base URL." },
];

export const byId = (id) => PROVIDERS.find((p) => p.id === id);

/* ------------------------------------------------------- normalisation */

/* Internal message shape is the Anthropic one: {role, content:[blocks]}.
 * tool_result blocks also carry `name`, which Gemini needs and the others
 * ignore. */
export const text = (t) => ({ type: "text", text: t });
export const userMsg = (t) => ({ role: "user", content: [text(t)] });

function toolSchema(t) {
	return { type: "object", properties: t.input_schema.properties || {}, required: t.input_schema.required || [] };
}

/* ---------------------------------------------------------- requests */

export function buildRequest(p, o) {
	const headers = { "content-type": "application/json", ...(p.headers || {}) };
	const base = (o.base || p.base).replace(/\/+$/, "");
	const tools = o.tools || [];
	const sys = o.system || "";

	if (p.kind === "anthropic") {
		headers["x-api-key"] = o.key;
		headers["anthropic-version"] = "2023-06-01";
		/* The page is the client, so the SDK's browser opt-in header is the
		 * honest one to send. The key is the user's own, typed into their
		 * own browser; there is no server here to hide it behind. */
		headers["anthropic-dangerous-direct-browser-access"] = "true";
		const body = {
			model: o.model, max_tokens: o.maxTokens || 16000, stream: true,
			messages: o.messages.map((m) => ({
				role: m.role,
				content: m.content.map((b) => b.type === "tool_result"
					? { type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, ...(b.is_error ? { is_error: true } : {}) }
					: b),
			})),
		};
		if (sys) body.system = sys;
		if (tools.length) body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: toolSchema(t) }));
		if (o.fallbacks) { headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; body.fallbacks = "default"; }
		return { url: base + "/v1/messages", headers, body };
	}

	if (p.kind === "gemini") {
		headers["x-goog-api-key"] = o.key;
		const contents = o.messages.map((m) => ({
			role: m.role === "assistant" ? "model" : "user",
			parts: m.content.map((b) => {
				if (b.type === "text") return { text: b.text };
				if (b.type === "tool_use") return { functionCall: { name: b.name, args: b.input } };
				return { functionResponse: { name: b.name, response: { result: b.content } } };
			}),
		}));
		const body = { contents, generationConfig: { maxOutputTokens: o.maxTokens || 16000 } };
		if (sys) body.systemInstruction = { parts: [{ text: sys }] };
		if (tools.length) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: toolSchema(t) })) }];
		return { url: `${base}/models/${o.model}:streamGenerateContent?alt=sse`, headers, body };
	}

	/* openai and everything that speaks it */
	if (o.key) headers.authorization = "Bearer " + o.key;
	const messages = [];
	if (sys) messages.push({ role: "system", content: sys });
	for (const m of o.messages) {
		if (m.role === "assistant") {
			const t = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
			const calls = m.content.filter((b) => b.type === "tool_use").map((b) => ({
				id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) } }));
			const msg = { role: "assistant", content: t || null };
			if (calls.length) msg.tool_calls = calls;
			messages.push(msg);
			continue;
		}
		const results = m.content.filter((b) => b.type === "tool_result");
		for (const r of results) messages.push({ role: "tool", tool_call_id: r.tool_use_id, content: String(r.content) });
		const t = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
		if (t) messages.push({ role: "user", content: t });
	}
	const body = { model: o.model, messages, stream: true };
	if (p.usage !== false) body.stream_options = { include_usage: true };
	if (tools.length) body.tools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: toolSchema(t) } }));
	return { url: base + "/chat/completions", headers, body };
}

/* ------------------------------------------------------------ parsing */

/* One parser per wire format. feed() takes a decoded SSE data object and
 * returns zero or more normalised events; end() flushes what a stream
 * without a proper terminator left behind. Tool calls are emitted whole,
 * once their arguments have finished arriving. */
export function makeParser(kind) {
	const blocks = new Map();  // index -> {id, name, json}
	let calls = 0;
	const flush = (i) => {
		const b = blocks.get(i);
		if (!b) return [];
		blocks.delete(i);
		let input = {};
		try { input = b.json ? JSON.parse(b.json) : {}; } catch { input = { _raw: b.json }; }
		return [{ type: "tool", id: b.id, name: b.name, input }];
	};

	if (kind === "anthropic") return {
		feed(d) {
			switch (d.type) {
			case "message_start": return [{ type: "usage", input: d.message?.usage?.input_tokens || 0, output: 0 }];
			case "content_block_start":
				if (d.content_block.type === "tool_use") blocks.set(d.index, { id: d.content_block.id, name: d.content_block.name, json: "" });
				return [];
			case "content_block_delta":
				if (d.delta.type === "text_delta") return [{ type: "text", text: d.delta.text }];
				if (d.delta.type === "input_json_delta" && blocks.has(d.index)) blocks.get(d.index).json += d.delta.partial_json;
				return [];
			case "content_block_stop": return flush(d.index);
			case "message_delta": {
				const out = [];
				if (d.usage) out.push({ type: "usage", input: 0, output: d.usage.output_tokens || 0 });
				if (d.delta?.stop_reason) out.push({ type: "stop", reason: d.delta.stop_reason, details: d.delta.stop_details });
				return out;
			}
			case "error": return [{ type: "error", message: d.error?.message || "stream error" }];
			default: return [];
			}
		},
		end() { return [...blocks.keys()].flatMap(flush); },
	};

	if (kind === "gemini") return {
		feed(d) {
			const out = [];
			const c = d.candidates && d.candidates[0];
			for (const part of (c?.content?.parts || [])) {
				if (part.text) out.push({ type: "text", text: part.text });
				if (part.functionCall) out.push({ type: "tool", id: "call_" + (++calls), name: part.functionCall.name, input: part.functionCall.args || {} });
			}
			if (d.usageMetadata) out.push({ type: "usage", input: d.usageMetadata.promptTokenCount || 0, output: d.usageMetadata.candidatesTokenCount || 0, absolute: true });
			if (c?.finishReason) out.push({ type: "stop", reason: c.finishReason === "STOP" ? "end_turn" : c.finishReason === "MAX_TOKENS" ? "max_tokens" : c.finishReason.toLowerCase() });
			if (d.error) out.push({ type: "error", message: d.error.message });
			return out;
		},
		end() { return []; },
	};

	/* openai */
	let finish = null;
	return {
		feed(d) {
			const out = [];
			if (d.error) return [{ type: "error", message: d.error.message || String(d.error) }];
			const ch = d.choices && d.choices[0];
			if (ch) {
				const delta = ch.delta || {};
				if (delta.content) out.push({ type: "text", text: delta.content });
				for (const tc of (delta.tool_calls || [])) {
					const b = blocks.get(tc.index) || { id: tc.id || "call_" + (++calls), name: "", json: "" };
					if (tc.id) b.id = tc.id;
					if (tc.function?.name) b.name += tc.function.name;
					if (tc.function?.arguments) b.json += tc.function.arguments;
					blocks.set(tc.index, b);
				}
				if (ch.finish_reason) finish = ch.finish_reason;
			}
			if (d.usage) out.push({ type: "usage", input: d.usage.prompt_tokens || 0, output: d.usage.completion_tokens || 0, absolute: true });
			return out;
		},
		end() {
			const out = [...blocks.keys()].sort().flatMap(flush);
			const reason = finish === "tool_calls" || out.length ? "tool_use" : finish === "length" ? "max_tokens" : "end_turn";
			out.push({ type: "stop", reason });
			return out;
		},
	};
}

/* Server-sent events, decoded from text chunks. Returns the data payloads
 * that are complete so far and keeps the rest for the next call. */
export function sseDecoder() {
	let buf = "";
	return {
		push(chunk) {
			buf += chunk;
			const out = [];
			let i;
			while ((i = buf.indexOf("\n\n")) >= 0) {
				const block = buf.slice(0, i);
				buf = buf.slice(i + 2);
				const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
				if (data && data !== "[DONE]") out.push(data);
			}
			return out;
		},
	};
}

/* ----------------------------------------------------------- streaming */

/* Run one model call and yield normalised events. `fetchImpl` is injected
 * so the tests can hand in a recorded stream. */
export async function* stream(p, o, fetchImpl = globalThis.fetch, signal) {
	const req = buildRequest(p, o);
	let res;
	try {
		res = await fetchImpl(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal });
	} catch (e) {
		throw new Error(networkHint(p, e));
	}
	if (!res.ok) {
		let msg = res.status + " " + res.statusText;
		try {
			const j = await res.json();
			msg += ": " + (j.error?.message || j.message || JSON.stringify(j)).slice(0, 400);
		} catch { /* no body */ }
		throw new Error(msg);
	}
	const parser = makeParser(p.kind);
	const dec = sseDecoder();
	const reader = res.body.getReader();
	const td = new TextDecoder();
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		for (const data of dec.push(td.decode(value, { stream: true }))) {
			let d;
			try { d = JSON.parse(data); } catch { continue; }
			for (const ev of parser.feed(d)) yield ev;
		}
	}
	for (const ev of parser.end()) yield ev;
}

function networkHint(p, e) {
	if (p.local) return `could not reach ${p.name} at ${p.base}. Is it running, and does it allow browser origins? ${p.note || ""}`;
	return `could not reach ${p.name}: ${e.message}. A browser extension, a proxy, or the provider's CORS policy may be blocking direct calls.`;
}

/* The model list a provider will admit to, for the settings screen. */
export async function listModels(p, key, base, fetchImpl = globalThis.fetch) {
	const b = (base || p.base).replace(/\/+$/, "");
	const h = {};
	let url;
	if (p.kind === "anthropic") { url = b + "/v1/models"; h["x-api-key"] = key; h["anthropic-version"] = "2023-06-01"; h["anthropic-dangerous-direct-browser-access"] = "true"; }
	else if (p.kind === "gemini") { url = b + "/models"; h["x-goog-api-key"] = key; }
	else { url = b + "/models"; if (key) h.authorization = "Bearer " + key; }
	const r = await fetchImpl(url, { headers: h });
	if (!r.ok) throw new Error(r.status + " " + r.statusText);
	const j = await r.json();
	if (p.kind === "gemini") return (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace(/^models\//, ""));
	return (j.data || []).map((m) => m.id).sort();
}
