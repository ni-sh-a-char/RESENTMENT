// SPDX-License-Identifier: Apache-2.0
// The desktop core, run under Node: filesystem, digest, leases, ledger, vault.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, Settings, FS, Leases, Ledger, Vault, digestOS, digestTree, diffNodes, normalize, canonical, covers } from "../os/desktop/js/core.js";

const fresh = () => {
	const store = new Store();
	const ledger = new Ledger(store);
	const fs = new FS(store, ledger).init();
	return { store, ledger, fs, settings: new Settings(store) };
};

test("paths normalise", () => {
	assert.equal(normalize("home/../etc//motd/"), "/etc/motd");
	assert.equal(normalize(""), "/");
	assert.equal(normalize("/a/./b/../c"), "/a/c");
});

test("filesystem: write, read, list, rm, and the default tree", () => {
	const { fs } = fresh();
	assert.ok(fs.read("/home/README.md").startsWith("# Welcome"));
	fs.write("/home/documents/notes/todo.txt", "one");
	assert.equal(fs.read("/home/documents/notes/todo.txt"), "one");
	assert.deepEqual(fs.list("/home/documents").map((e) => e.name), ["notes"]);
	assert.throws(() => fs.read("/home"), /is a directory/);
	assert.throws(() => fs.list("/home/README.md"), /not a directory/);
	fs.rm("/home/documents/notes");
	assert.equal(fs.exists("/home/documents/notes/todo.txt"), false);
	assert.throws(() => fs.rm("/"), /refusing/);
});

test("digest: stable across time, moves with content, secrets excluded", async () => {
	const a = fresh(), b = fresh();
	const da = await digestOS(a.fs, a.settings);
	const db = await digestOS(b.fs, b.settings);
	assert.equal(da.root, db.root, "two fresh machines hash identically");
	assert.equal(da.root.length, 64);

	b.fs.write("/home/x.txt", "hello");
	const db2 = await digestOS(b.fs, b.settings);
	assert.notEqual(db2.root, da.root, "a write changes the root");
	const d = diffNodes(da.nodes, db2.nodes);
	assert.deepEqual(d.added, ["/home/x.txt"]);
	assert.deepEqual(d.changed, ["/", "/home"], "only the ancestors change");

	// A key in the vault must never move the digest.
	const v = new Vault(b.store);
	await v.set("anthropic", "sk-ant-secret");
	const db3 = await digestOS(b.fs, b.settings);
	assert.equal(db3.root, db2.root);

	// Rewriting the same bytes later is the same tree.
	b.fs.write("/home/x.txt", "hello");
	assert.equal((await digestTree(b.fs)).root, db2.tree);
});

test("canonical json sorts keys", () => {
	assert.equal(canonical({ b: 1, a: [1, { d: 2, c: 3 }] }), '{"a":[1,{"c":3,"d":2}],"b":1}');
});

test("leases expire, cover sub-scopes, and revoke", () => {
	let t = 1000;
	const L = new Leases(() => t);
	assert.equal(L.check("agent:1", "fs.read"), null);
	const l = L.grant("agent:1", "fs", 5000, "to read notes");
	assert.ok(L.check("agent:1", "fs.read"), "fs covers fs.read");
	assert.ok(L.check("agent:1", "fs.write"));
	assert.equal(L.check("agent:2", "fs.read"), null, "another subject gets nothing");
	assert.equal(L.check("agent:1", "shell"), null);
	t = 5999;
	assert.ok(L.check("agent:1", "fs.read"));
	t = 6000;
	assert.equal(L.check("agent:1", "fs.read"), null, "gone exactly at the deadline");
	assert.equal(L.list().length, 0);
	const m = L.grant("agent:1", "*", 100);
	assert.ok(L.check("agent:1", "kernel"));
	L.revoke(m.id);
	assert.equal(L.check("agent:1", "kernel"), null);
	assert.ok(covers("fs", "fs.read") && !covers("fs.read", "fs") && covers("*", "x"));
	void l;
});

test("ledger records causes and undo restores files without deleting history", () => {
	const { fs, ledger } = fresh();
	const before = ledger.all().length;
	fs.write("/home/a.txt", "v1", { actor: "agent:7" });
	const mark = ledger.all().length;
	fs.write("/home/a.txt", "v2", { actor: "agent:7", cause: mark });
	fs.write("/home/b.txt", "new", { actor: "agent:7" });
	fs.rm("/etc/motd", { actor: "agent:7" });
	assert.equal(ledger.byActor("agent:7").length, 4);
	assert.equal(ledger.all()[mark].cause, mark);

	ledger.undoTo(mark, fs);
	assert.equal(fs.read("/home/a.txt"), "v1");
	assert.equal(fs.exists("/home/b.txt"), false);
	assert.equal(fs.read("/etc/motd"), "authority expires. the system is a graph you can hash.\n");
	const last = ledger.all().at(-1);
	assert.equal(last.kind, "undo");
	assert.equal(last.reversed.length, 3);
	assert.equal(ledger.all().length, before + 5, "nothing was deleted");
	assert.ok(ledger.toJSONL().split("\n").length > 5);
});

test("vault: plain by default, sealed under a passphrase, wrong passphrase refused", async () => {
	const store = new Store();
	const v = new Vault(store);
	await v.set("openai", "sk-plain");
	assert.equal(store.get("vault:key:openai").plain, "sk-plain");
	await v.seal("correct horse");
	assert.ok(v.sealed && !v.locked);
	assert.equal(store.get("vault:key:openai").plain, undefined, "no plaintext at rest");
	assert.equal(await v.get("openai"), "sk-plain");
	await v.set("groq", "gsk-x");

	const again = new Vault(store);
	assert.ok(again.locked);
	assert.equal(await again.unlock("wrong"), false);
	assert.ok(again.locked);
	await assert.rejects(() => again.get("groq"), /locked/);
	assert.equal(await again.unlock("correct horse"), true);
	assert.equal(await again.get("groq"), "gsk-x");
	assert.deepEqual(again.ids(), ["groq", "openai"]);
});

test("store persists through a backend and reloads", async () => {
	const rows = new Map();
	const backend = { load: async () => [...rows], put: (k, v) => rows.set(k, v), del: (k) => rows.delete(k) };
	const s1 = await new Store(backend).open();
	new FS(s1).init();
	s1.set("settings", { theme: "light" });
	const s2 = await new Store(backend).open();
	assert.equal(new Settings(s2).get("theme"), "light");
	assert.ok(new FS(s2).exists("/home/README.md"));
});
