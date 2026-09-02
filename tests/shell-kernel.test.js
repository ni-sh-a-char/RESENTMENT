// SPDX-License-Identifier: Apache-2.0
// The terminal's command language, and the serial protocol to the kernel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, Settings, FS, Leases, Ledger, diffNodes, digestOS } from "../os/desktop/js/core.js";
import { Agents } from "../os/desktop/js/agent.js";
import { makeShell, words } from "../os/desktop/js/shell.js";
import { KernelLink } from "../os/desktop/js/kernel.js";

function osFixture() {
	const store = new Store();
	const ledger = new Ledger(store);
	const fs = new FS(store, ledger).init();
	const settings = new Settings(store);
	const os = { store, fs, ledger, settings, leases: new Leases(), digest: "", diff: diffNodes, opened: [], asked: [] };
	os.agents = new Agents(os);
	os.kernel = { attached: false, eval: async (l) => "kernel says " + l };
	os.ui = { open: (app, a) => os.opened.push([app, a]), ask: (q) => os.asked.push(q) };
	os.snapshot = async (name) => {
		const d = await digestOS(fs, settings);
		const s = { name: name || "snap" + (store.get("snapshots", []).length + 1), root: d.root, nodes: d.nodes, ts: Date.now() };
		store.set("snapshots", [...store.get("snapshots", []), s]);
		return s;
	};
	return os;
}

test("words honour quotes", () => {
	assert.deepEqual(words('write "my file.txt" hello there'), ["write", "my file.txt", "hello", "there"]);
});

test("shell: files, cwd, snapshots and diff", async () => {
	const os = osFixture();
	const sh = makeShell(os);
	assert.equal(await sh.run("pwd"), "/home");
	await sh.run("mkdir notes");
	await sh.run("cd notes");
	assert.equal(sh.cwd, "/home/notes");
	await sh.run("write a.txt first line of a");
	await sh.run("append a.txt second");
	assert.equal(await sh.run("cat a.txt"), "first line of asecond\n");
	assert.match(await sh.run("ls"), /a\.txt/);
	assert.match(await sh.run("ls /"), /home\//);
	assert.equal(await sh.run("find second"), "/home/notes/a.txt");
	await sh.run("snapshot before");
	await sh.run("cp a.txt b.txt");
	await sh.run("mv b.txt c.txt");
	assert.equal(os.fs.exists("/home/notes/b.txt"), false);
	await sh.run("snapshot after");
	const d = await sh.run("diff before after");
	assert.match(d, /added:\s+\/home\/notes\/c\.txt/);
	assert.match(d, /changed:.*\/home\/notes/);
	await sh.run("rm /home/notes");
	assert.equal(os.fs.exists("/home/notes"), false);
	assert.equal(sh.cwd, "/home/notes", "cwd is only a string");
	await assert.rejects(() => sh.run("cd /nowhere"), /no such directory/);
	await assert.rejects(() => sh.run("frobnicate"), /unknown command/);
});

test("shell: agents, leases, apps and the kernel", async () => {
	const os = osFixture();
	const sh = makeShell(os);
	const a = os.agents.spawn({ name: "worker" });
	assert.match(await sh.run("ps"), /worker/);
	os.leases.grant(a.subject, "fs", 60000);
	assert.match(await sh.run("leases"), /agent:1\s+fs/);
	await sh.run("revoke 1");
	assert.equal(await sh.run("leases"), "(no active leases)");
	assert.equal(await sh.run("kill 1"), "kill 1");
	assert.equal(a.state, "killed");
	await sh.run("open editor /home/README.md");
	assert.deepEqual(os.opened[0], ["editor", { path: "/home/README.md" }]);
	assert.equal(await sh.run("ai what is this"), "asked.");
	assert.deepEqual(os.asked, ["what is this"]);
	assert.equal(await sh.run("kernel 2 + 2"), "kernel says 2 + 2");
	assert.match(await sh.run("help"), /kernel <line>/);
});

/* A fake WebSocket that behaves like the kernel behind the bridge: boot
 * log, a prompt, echo of every typed line, then an answer and a prompt. */
class FakeWS {
	constructor(url) {
		this.url = url;
		this.sent = [];
		setTimeout(() => { this.onopen(); this.onmessage({ data: "boot complete\n\x1b[32mresentment> \x1b[0m" }); }, 1);
	}
	send(s) {
		this.sent.push(s);
		const line = s.replace(/\r$/, "");
		const reply = line === "2 + 2" ? "4" : line === ".digest" ? "7d4a1f0e83c25b9a6f1e0d4c8b3a7e2f5d9c1b8a4e7f0c3d6a9b2e5f8c1d4a7b" : line === "slow" ? null : "?";
		/* echo first, then the reply in a separate frame, then the prompt */
		setTimeout(() => this.onmessage({ data: line + "\r\n" }), 1);
		if (reply !== null) setTimeout(() => this.onmessage({ data: reply + "\r\nresentment> " }), 3);
	}
	close() { this.onclose && this.onclose(); }
}

test("kernel link: eval waits for the prompt, strips echo and ANSI, queues in order, times out", async () => {
	const k = new KernelLink("ws://x/serial", FakeWS);
	const seen = [];
	k.onData((t) => seen.push(t));
	await k.connect();
	assert.ok(k.attached);
	assert.match(seen[0], /boot complete/);
	assert.doesNotMatch(k.log, /\x1b/, "ANSI is stripped");

	const [a, b] = await Promise.all([k.eval("2 + 2"), k.eval(".digest")]);
	assert.equal(a, "4");
	assert.equal(b, "7d4a1f0e83c25b9a6f1e0d4c8b3a7e2f5d9c1b8a4e7f0c3d6a9b2e5f8c1d4a7b");
	assert.equal(k.digest, b, "the top bar gets the digest");
	assert.deepEqual(k.ws.sent, ["2 + 2\r", ".digest\r"]);

	await assert.rejects(() => k.eval("slow", 30), /did not answer/);
	assert.equal(await k.eval("2 + 2"), "4", "the link recovers after a timeout");

	k.close();
	assert.equal(k.attached, false);
	await assert.rejects(() => k.eval("2 + 2"), /not attached/);
});
