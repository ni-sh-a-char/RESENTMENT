/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - agents are processes.
 *
 * An agent here is what a task is in the kernel: it has an id, a state, a
 * budget, an empty capability set at birth, and a place in the process
 * list where it can be paused or killed. Every tool it wants to use names a
 * scope; the first use of a scope stops the agent until the user grants a
 * lease, and the lease expires on its own. Every tool call is a ledger
 * entry and every file it touches names that entry as its cause, so the
 * question "why does this file look like this" has an answer.
 *
 * Nothing in this file touches the DOM. The desktop supplies `os` with the
 * filesystem, leases, ledger, vault, the shell, the kernel link and three
 * UI callbacks; the tests supply fakes.
 */
import { emit, uid } from "./core.js";
import { stream, byId, text, userMsg } from "./providers.js";

export const SCOPES = {
	"fs.read":  "read your files",
	"fs.write": "create, change or delete your files",
	"shell":    "run commands in the terminal",
	"kernel":   "talk to the RESENTMENT kernel",
	"web":      "fetch pages from the internet",
	"os":       "open apps, show notifications, take snapshots",
};

const str = (s) => ({ type: "string", description: s });

export const TOOLS = [
	{ name: "fs_list", scope: "fs.read",
	  description: "List a directory of the user's filesystem. Returns name, type and size of each entry.",
	  input_schema: { properties: { path: str("Directory path, default /") } },
	  run: (a, os) => os.fs.list(a.path || "/").map((e) => `${e.type === "dir" ? "d" : "f"} ${e.size}\t${e.path}`).join("\n") || "(empty)" },
	{ name: "fs_tree", scope: "fs.read",
	  description: "Every path under a directory, recursively.",
	  input_schema: { properties: { path: str("Directory path, default /") } },
	  run: (a, os) => os.fs.walk(a.path || "/").map((e) => e.path + (e.type === "dir" ? "/" : "")).join("\n") || "(empty)" },
	{ name: "fs_read", scope: "fs.read",
	  description: "Read a text file.",
	  input_schema: { properties: { path: str("File path") }, required: ["path"] },
	  run: (a, os) => os.fs.read(a.path) },
	{ name: "fs_write", scope: "fs.write",
	  description: "Create or replace a text file. Parent directories are created.",
	  input_schema: { properties: { path: str("File path"), content: str("Full new content") }, required: ["path", "content"] },
	  run: (a, os, ctx) => { os.fs.write(a.path, a.content, ctx); return `wrote ${a.content.length} bytes to ${a.path}`; } },
	{ name: "fs_delete", scope: "fs.write",
	  description: "Delete a file or a directory and everything under it.",
	  input_schema: { properties: { path: str("Path") }, required: ["path"] },
	  run: (a, os, ctx) => { os.fs.rm(a.path, ctx); return `deleted ${a.path}`; } },
	{ name: "shell_run", scope: "shell",
	  description: "Run one line in the RESENTMENT terminal. `help` lists the commands.",
	  input_schema: { properties: { command: str("The command line") }, required: ["command"] },
	  run: (a, os, ctx) => os.shell(a.command, ctx) },
	{ name: "kernel_eval", scope: "kernel",
	  description: "Send a line to the RESENTMENT kernel's shell over the serial bridge and return what it printed. The shell is a SHE interpreter: `2 + 2`, `digest()`, `system()`, `.ls /graph`, `.kaalka`, `.ai`, `.ps`, `.help`. Scripts start with no permissions; `.allow read` etc. grants them.",
	  input_schema: { properties: { line: str("One line of SHE or a dot-command") }, required: ["line"] },
	  run: (a, os) => os.kernel.eval(a.line) },
	{ name: "web_fetch", scope: "web",
	  description: "Fetch a URL and return its text (first 20000 characters). Only works for sites that allow cross-origin requests.",
	  input_schema: { properties: { url: str("Absolute URL") }, required: ["url"] },
	  run: async (a, os) => (await (await os.fetch(a.url)).text()).slice(0, 20000) },
	{ name: "os_open", scope: "os",
	  description: "Open an app window: files, editor (with an optional path), terminal, settings, agents, ledger, graph, kernel, about.",
	  input_schema: { properties: { app: str("App id"), path: str("File path, for the editor") }, required: ["app"] },
	  run: (a, os) => { os.ui.open(a.app, a); return "opened " + a.app; } },
	{ name: "os_notify", scope: "os",
	  description: "Show the user a notification.",
	  input_schema: { properties: { title: str("Short title"), body: str("One or two sentences") }, required: ["title"] },
	  run: (a, os) => { os.ui.notify(a.title, a.body || ""); return "shown"; } },
	{ name: "os_snapshot", scope: "os",
	  description: "Record a named snapshot of the whole OS digest, so this moment can be diffed against later.",
	  input_schema: { properties: { name: str("Snapshot name") }, required: ["name"] },
	  run: async (a, os) => { const s = await os.snapshot(a.name); return `snapshot ${s.name} root ${s.root}`; } },
];
export const toolByName = (n) => TOOLS.find((t) => t.name === n);

export function systemPrompt(os, agent) {
	const s = os.settings.all();
	const who = s.name ? ` The user's name is ${s.name}.` : "";
	return [
		`You are the assistant built into RESENTMENT OS, an AI operating system running in the user's browser on top of the RESENTMENT kernel. You are process "${agent.name}" (id ${agent.id}).${who}`,
		"",
		"How this OS works, and how you should behave in it:",
		"- You start with no permissions. Each tool names a scope (fs.read, fs.write, shell, kernel, web, os). The first time you use a scope the OS pauses you and asks the user for a lease; leases expire on their own. Ask for as little as the task needs, and say what you intend before a write.",
		"- Every tool call is written to a ledger the user can read and undo. Prefer small, reversible changes.",
		"- The user's files live under /home. /home/documents is for their work, /home/agents is yours for notes and scratch.",
		"- The whole OS has one SHA-256 digest; the user can snapshot and diff it. Mention it when it is relevant, not otherwise.",
		"- When the kernel is attached you can run SHE on it. Its shell starts with time, graph and random permissions only.",
		"- Answer plainly. Use short paragraphs and lists; code goes in fenced blocks. Do not narrate tool calls the user can already see.",
		"",
		`Current digest: ${os.digest ? os.digest.slice(0, 16) + "…" : "unknown"}. Kernel: ${os.kernel.attached ? "attached" : "not attached"}. Date: ${new Date().toISOString().slice(0, 10)}.`,
	].join("\n");
}

let nextId = 1;

export class Agent {
	constructor(os, opts = {}) {
		this.os = os;
		this.id = opts.id || nextId++;
		nextId = Math.max(nextId, this.id + 1);
		this.name = opts.name || "Ask";
		this.provider = opts.provider || os.settings.get("provider");
		this.model = opts.model || os.settings.get("model");
		this.budget = opts.budget || os.settings.get("budgetTokens");
		this.subject = "agent:" + this.id;
		this.state = "idle";       // idle | running | waiting | paused | killed
		this.reason = "";
		this.messages = [];
		this.usage = { input: 0, output: 0 };
		this.started = Date.now();
		this.calls = 0;
		this.abort = null;
	}
	get tokens() { return this.usage.input + this.usage.output; }
	setState(s, reason = "") { this.state = s; this.reason = reason; emit("agent", { agent: this, kind: "state" }); }
	kill() { this.setState("killed"); if (this.abort) this.abort.abort(); this.os.leases.revokeAll(this.subject); }
	pause() { if (this.state === "running") { this.setState("paused", "paused by user"); if (this.abort) this.abort.abort(); } }
	resume() { if (this.state === "paused") { this.setState("idle"); return this.loop(); } }

	/* A user turn. Returns when the agent has nothing more to do. */
	async send(txt) {
		if (this.state === "killed") throw new Error("this agent was killed");
		this.messages.push(userMsg(txt));
		emit("agent", { agent: this, kind: "message", message: this.messages.at(-1) });
		return this.loop();
	}

	async loop() {
		const p = byId(this.provider);
		if (!p) { this.setState("paused", "no provider configured - open Settings"); return; }
		for (;;) {
			if (this.state === "killed") return;
			if (this.tokens >= this.budget) { this.setState("paused", `budget of ${this.budget} tokens reached`); return; }
			this.setState("running");

			const key = p.local ? "" : await this.os.vault.get(this.provider);
			const custom = this.os.store.get("provider:" + this.provider, {});
			const assistant = { role: "assistant", content: [] };
			const tools = [];
			let stop = "end_turn";
			this.abort = new AbortController();
			let usageAbs = null;
			try {
				const it = stream(p, {
					key, base: custom.base, model: this.model, system: systemPrompt(this.os, this),
					messages: this.messages, tools: TOOLS,
					fallbacks: p.kind === "anthropic" && this.os.settings.get("anthropicFallbacks"),
					/* An in-browser model reports its download; that is the
					 * agent's reason for the moment, shown under the chat. */
					onStatus: (t) => { this.reason = t; emit("agent", { agent: this, kind: "state" }); },
				}, this.os.fetch, this.abort.signal);
				for await (const ev of it) {
					if (ev.type === "text") {
						const last = assistant.content.at(-1);
						if (last && last.type === "text") last.text += ev.text; else assistant.content.push(text(ev.text));
						emit("agent", { agent: this, kind: "delta", text: ev.text });
					} else if (ev.type === "tool") {
						assistant.content.push({ type: "tool_use", id: ev.id, name: ev.name, input: ev.input });
						tools.push(ev);
					} else if (ev.type === "usage") {
						if (ev.absolute) usageAbs = ev; else { this.usage.input += ev.input; this.usage.output += ev.output; }
					} else if (ev.type === "stop") stop = ev.reason;
					else if (ev.type === "error") throw new Error(ev.message);
				}
			} catch (e) {
				if (this.state === "killed" || this.state === "paused") return;
				this.setState("paused", "error: " + e.message);
				emit("agent", { agent: this, kind: "error", error: e.message });
				return;
			}
			if (usageAbs) { this.usage.input += usageAbs.input; this.usage.output += usageAbs.output; }
			if (assistant.content.length) this.messages.push(assistant);
			emit("agent", { agent: this, kind: "message", message: assistant, stop });

			if (stop === "refusal") { this.setState("idle", "the model declined this request"); return; }
			if (!tools.length) { this.setState("idle"); return; }

			const results = [];
			for (const call of tools) results.push(await this.runTool(call));
			if (this.state === "killed") return;
			this.messages.push({ role: "user", content: results });
		}
	}

	/* One tool call: check the lease, ask for one if there is none, run,
	 * record. A refusal is a result the model sees, not an exception. */
	async runTool(call) {
		const t = toolByName(call.name);
		const result = (content, is_error = false) => ({ type: "tool_result", tool_use_id: call.id, name: call.name, content: String(content), is_error });
		if (!t) return result(`unknown tool ${call.name}`, true);

		let lease = this.os.leases.check(this.subject, t.scope);
		if (!lease) {
			this.setState("waiting", `needs ${t.scope}`);
			lease = await this.os.ui.askLease(this, t.scope, call);
			if (this.state === "killed") { this.os.leases.revokeAll(this.subject); return result("agent killed", true); }
			this.setState("running");
			if (!lease) {
				this.os.ledger.append({ kind: "tool.denied", actor: this.subject, tool: call.name, scope: t.scope, input: call.input });
				emit("agent", { agent: this, kind: "tool", call, ok: false, output: "denied" });
				return result(`permission denied: the user did not grant ${t.scope}`, true);
			}
		}
		const entry = this.os.ledger.append({ kind: "tool", actor: this.subject, tool: call.name, scope: t.scope, input: call.input, lease: lease.id });
		this.calls++;
		try {
			const out = await t.run(call.input || {}, this.os, { actor: this.subject, cause: entry.seq });
			emit("agent", { agent: this, kind: "tool", call, ok: true, output: out });
			return result(out);
		} catch (e) {
			this.os.ledger.append({ kind: "tool.error", actor: this.subject, tool: call.name, error: e.message, cause: entry.seq });
			emit("agent", { agent: this, kind: "tool", call, ok: false, output: e.message });
			return result("error: " + e.message, true);
		}
	}

	/* The transcript as the chat window shows it. */
	get transcript() { return this.messages; }
	toJSON() { return { id: this.id, name: this.name, provider: this.provider, model: this.model, state: this.state, reason: this.reason, usage: this.usage, budget: this.budget, calls: this.calls, started: this.started }; }
}

/* The process table. */
export class Agents {
	constructor(os) { this.os = os; this.list = []; }
	spawn(opts) { const a = new Agent(this.os, opts); this.list.push(a); emit("agent", { agent: a, kind: "spawn" }); return a; }
	get(id) { return this.list.find((a) => a.id === Number(id)); }
	running() { return this.list.filter((a) => a.state === "running" || a.state === "waiting"); }
}

export { uid };
