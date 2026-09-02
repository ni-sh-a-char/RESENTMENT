/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - the desktop's core runtime.
 *
 * Everything here is plain data and plain functions with no DOM, so the
 * same file runs under Node for the tests and in the browser for real. The
 * ideas the kernel is built on appear here in the same shape:
 *
 *   leases    authority that expires - every grant carries a deadline
 *   digest    the whole OS as one SHA-256 root, timestamps excluded
 *   ledger    a causal, append-only log; undo is a new entry, not a deletion
 *   vault     keys live only on this machine, optionally sealed under a
 *             passphrase with AES-GCM
 *
 * The filesystem is a map from path to entry held in memory and written
 * through to a backend. ponytail: the whole tree lives in memory, which is
 * fine to a few tens of megabytes; move to per-file IndexedDB reads if a
 * user ever imports a video.
 */

export const VERSION = "2.0.0";
export const CODENAME = "prahar";

/* ----------------------------------------------------------------- bus */

/* One EventTarget for the whole desktop. Names are dotted: "fs", "lease",
 * "ledger", "agent", "settings". */
export const bus = new EventTarget();
export function emit(name, detail) {
	bus.dispatchEvent(new CustomEvent(name, { detail }));
}
export function on(name, fn) {
	const h = (e) => fn(e.detail);
	bus.addEventListener(name, h);
	return () => bus.removeEventListener(name, h);
}

/* --------------------------------------------------------------- store */

/* Key/value with write-through persistence. The backend is optional so the
 * tests and a private window both work with nothing behind it. */
export class Store {
	constructor(backend = null) {
		this.backend = backend;
		this.map = new Map();
	}
	async open() {
		if (!this.backend) return this;
		for (const [k, v] of await this.backend.load()) this.map.set(k, v);
		return this;
	}
	get(k, dflt) { return this.map.has(k) ? this.map.get(k) : dflt; }
	set(k, v) {
		this.map.set(k, v);
		if (this.backend) this.backend.put(k, v);
		return v;
	}
	del(k) {
		this.map.delete(k);
		if (this.backend) this.backend.del(k);
	}
	keys(prefix = "") {
		return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
	}
	clear() {
		for (const k of [...this.map.keys()]) this.del(k);
	}
}

/* IndexedDB, one object store, one row per key. Browser only. */
export function idbBackend(name = "resentment-os") {
	let db;
	const open = () => new Promise((res, rej) => {
		const r = indexedDB.open(name, 1);
		r.onupgradeneeded = () => r.result.createObjectStore("kv");
		r.onsuccess = () => res(r.result);
		r.onerror = () => rej(r.error);
	});
	const tx = (mode, fn) => new Promise((res, rej) => {
		const t = db.transaction("kv", mode);
		const req = fn(t.objectStore("kv"));
		t.oncomplete = () => res(req && req.result);
		t.onerror = () => rej(t.error);
	});
	return {
		async load() {
			db = await open();
			const keys = await tx("readonly", (s) => s.getAllKeys());
			const vals = await tx("readonly", (s) => s.getAll());
			return keys.map((k, i) => [k, vals[i]]);
		},
		put: (k, v) => tx("readwrite", (s) => s.put(v, k)),
		del: (k) => tx("readwrite", (s) => s.delete(k)),
	};
}

/* ------------------------------------------------------------ settings */

export const DEFAULT_SETTINGS = {
	theme: "dark",             // dark | light
	accent: "time",            // time | fixed - "time" keys the hue from the clock
	provider: "",              // id of the provider used by default
	model: "",                 // model id for that provider
	budgetTokens: 200000,      // per-agent ceiling before it pauses
	leaseMinutes: 15,          // default lease length offered first
	anthropicFallbacks: false, // opt in to server-side refusal fallbacks (beta)
	kernelUrl: "ws://localhost:7411/serial",
	name: "",                  // what the OS calls you
	onboarded: false,
};

export class Settings {
	constructor(store) { this.store = store; }
	all() { return { ...DEFAULT_SETTINGS, ...this.store.get("settings", {}) }; }
	get(k) { return this.all()[k]; }
	set(patch) {
		const next = { ...this.store.get("settings", {}), ...patch };
		this.store.set("settings", next);
		emit("settings", next);
		return next;
	}
}

/* ------------------------------------------------------------------ fs */

export function normalize(p) {
	const parts = [];
	for (const seg of String(p || "/").split("/")) {
		if (!seg || seg === ".") continue;
		if (seg === "..") parts.pop();
		else parts.push(seg);
	}
	return "/" + parts.join("/");
}
export const dirname = (p) => { const n = normalize(p); const i = n.lastIndexOf("/"); return i <= 0 ? "/" : n.slice(0, i); };
export const basename = (p) => normalize(p).split("/").pop() || "/";

const WELCOME = [
	"# Welcome to RESENTMENT OS",
	"",
	"This is your home. Everything in it lives in this browser and nowhere else.",
	"",
	"- Press **Ctrl+K** and type what you want. An app name opens it; anything",
	"  else is a question for the AI.",
	"- Agents start with **no permissions**. When one needs to read or write here",
	"  it asks, and whatever you grant expires on its own.",
	"- The hash in the top bar is this whole OS as one number. Change a file and",
	"  watch it change.",
	"",
].join("\n");

const DEFAULT_TREE = {
	"/home": null, "/home/documents": null, "/home/agents": null, "/etc": null, "/tmp": null,
	"/home/README.md": WELCOME,
	"/etc/motd": "authority expires. the system is a graph you can hash.\n",
};

export class FS {
	constructor(store, ledger = null) {
		this.store = store;
		this.ledger = ledger;
	}
	init() {
		if (!this.store.get("fs:/")) this.store.set("fs:/", { type: "dir", mtime: 0 });
		for (const [p, data] of Object.entries(DEFAULT_TREE)) {
			if (this.store.get("fs:" + p)) continue;
			if (data === null) this.mkdir(p, { silent: true });
			else this.write(p, data, { silent: true });
		}
		return this;
	}
	stat(p) { return this.store.get("fs:" + normalize(p)) || null; }
	exists(p) { return !!this.stat(p); }
	read(p) {
		const e = this.stat(p);
		if (!e) throw new Error(`no such file: ${normalize(p)}`);
		if (e.type !== "file") throw new Error(`is a directory: ${normalize(p)}`);
		return e.data;
	}
	list(dir = "/") {
		const d = normalize(dir);
		const st = this.stat(d);
		if (!st) throw new Error(`no such directory: ${d}`);
		if (st.type !== "dir") throw new Error(`not a directory: ${d}`);
		const prefix = "fs:" + (d === "/" ? "/" : d + "/");
		return this.store.keys(prefix)
			.filter((k) => k.length > prefix.length && !k.slice(prefix.length).includes("/"))
			.map((k) => {
				const e = this.store.get(k);
				return { name: k.slice(prefix.length), path: k.slice(3), type: e.type,
				         size: e.type === "file" ? e.data.length : 0, mtime: e.mtime };
			})
			.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
	}
	/* Every file path under a directory, for the agent's "tree" view. */
	walk(dir = "/", out = []) {
		for (const e of this.list(dir)) {
			out.push(e);
			if (e.type === "dir") this.walk(e.path, out);
		}
		return out;
	}
	mkdir(p, opts = {}) {
		const path = normalize(p);
		if (path === "/") return;
		const parent = dirname(path);
		if (!this.stat(parent)) this.mkdir(parent, opts);
		const st = this.stat(path);
		if (st && st.type === "dir") return;
		if (st) throw new Error(`file exists: ${path}`);
		this.store.set("fs:" + path, { type: "dir", mtime: Date.now() });
		this._log("fs.mkdir", { path }, opts);
	}
	write(p, text, opts = {}) {
		const path = normalize(p);
		const parent = dirname(path);
		if (!this.stat(parent)) this.mkdir(parent, opts);
		const prev = this.stat(path);
		if (prev && prev.type === "dir") throw new Error(`is a directory: ${path}`);
		this.store.set("fs:" + path, { type: "file", data: String(text), mtime: Date.now() });
		this._log("fs.write", { path, before: prev ? prev.data : null }, opts);
	}
	rm(p, opts = {}) {
		const path = normalize(p);
		if (path === "/") throw new Error("refusing to remove /");
		const st = this.stat(path);
		if (!st) throw new Error(`no such file: ${path}`);
		const removed = [];
		for (const k of this.store.keys("fs:" + path)) {
			if (k === "fs:" + path || k.startsWith("fs:" + path + "/")) {
				removed.push([k.slice(3), this.store.get(k)]);
				this.store.del(k);
			}
		}
		this._log("fs.rm", { path, removed }, opts);
	}
	/* Used by undo: put an entry back exactly as it was, no ledger entry. */
	restore(path, entry) {
		if (entry) this.store.set("fs:" + path, entry);
		else this.store.del("fs:" + path);
		emit("fs", { kind: "fs.restore", path });
	}
	_log(kind, fields, opts) {
		if (opts.silent) return;
		if (this.ledger) this.ledger.append({ kind, actor: opts.actor || "user", cause: opts.cause, ...fields });
		emit("fs", { kind, ...fields });
	}
}

/* -------------------------------------------------------------- digest */

const enc = new TextEncoder();
const subtle = globalThis.crypto && globalThis.crypto.subtle;

export async function sha256hex(text) {
	const buf = await subtle.digest("SHA-256", enc.encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Canonical JSON: sorted keys, no whitespace, so the same value always
 * hashes the same. */
export function canonical(v) {
	if (v === null || typeof v !== "object") return JSON.stringify(v);
	if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
	return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}

/* The Merkle tree over the filesystem. A file hashes its path and its
 * bytes; a directory hashes its name and the sorted digests of its
 * children. mtime is deliberately left out, exactly as the kernel leaves
 * timestamps out of its own canonical encoding: two machines with the same
 * files should agree on the number even if they wrote them at different
 * times. */
export async function digestTree(fs, dir = "/") {
	const nodes = {};
	const walk = async (d) => {
		const parts = [];
		for (const k of fs.list(d)) {
			const h = k.type === "dir" ? await walk(k.path)
				: await sha256hex("file\0" + k.path + "\0" + fs.read(k.path));
			nodes[k.path] = h;
			parts.push(h);
		}
		const h = await sha256hex("dir\0" + basename(d) + "\0" + parts.sort().join(""));
		nodes[d] = h;
		return h;
	};
	const root = await walk(dir);
	return { root, nodes };
}

/* The OS digest: the tree plus the settings that shape behaviour. Secrets
 * are never part of it: the vault keeps them under its own keys, which the
 * digest does not read, and the settings object holds no key material. */
export async function digestOS(fs, settings) {
	const tree = await digestTree(fs);
	const s = await sha256hex("settings\0" + canonical(settings.all()));
	const root = await sha256hex("os\0" + tree.root + "\0" + s);
	return { root, tree: tree.root, settings: s, nodes: tree.nodes };
}

/* Which paths differ between two snapshots' node maps. */
export function diffNodes(a, b) {
	const out = { added: [], removed: [], changed: [] };
	for (const p of Object.keys(b)) {
		if (!(p in a)) out.added.push(p);
		else if (a[p] !== b[p]) out.changed.push(p);
	}
	for (const p of Object.keys(a)) if (!(p in b)) out.removed.push(p);
	for (const k of Object.keys(out)) out[k].sort();
	return out;
}

/* -------------------------------------------------------------- leases */

/* A lease is authority with a deadline. There is no "grant forever": the
 * longest the UI offers is a working day, and the check is against the
 * clock every time, so a forgotten grant stops working by itself. Scopes
 * are dotted and a grant of "fs" covers "fs.read"; "*" covers everything. */
export class Leases {
	constructor(now = () => Date.now()) {
		this.now = now;
		this.items = [];
		this.seq = 0;
	}
	grant(subject, scope, ms, reason = "") {
		const l = { id: ++this.seq, subject, scope, until: this.now() + ms, since: this.now(), reason };
		this.items.push(l);
		emit("lease", { kind: "grant", lease: l });
		return l;
	}
	check(subject, scope) {
		this.prune();
		return this.items.find((l) => (l.subject === subject || l.subject === "*") && covers(l.scope, scope)) || null;
	}
	revoke(id) {
		const i = this.items.findIndex((l) => l.id === id);
		if (i >= 0) { const [l] = this.items.splice(i, 1); emit("lease", { kind: "revoke", lease: l }); }
	}
	revokeAll(subject) { for (const l of this.list()) if (l.subject === subject) this.revoke(l.id); }
	prune() {
		const t = this.now();
		const dead = this.items.filter((l) => l.until <= t);
		if (dead.length) {
			this.items = this.items.filter((l) => l.until > t);
			for (const l of dead) emit("lease", { kind: "expire", lease: l });
		}
	}
	list() { this.prune(); return [...this.items]; }
}
export function covers(granted, wanted) {
	return granted === "*" || granted === wanted || wanted.startsWith(granted + ".");
}

/* -------------------------------------------------------------- ledger */

/* Append-only, causal: every entry may name the entry that caused it, which
 * is how "what did this agent do, and why" is answered later. Undo never
 * deletes: it appends an "undo" entry and restores the filesystem, so the
 * history of the history is itself history. */
export class Ledger {
	constructor(store) {
		this.store = store;
		this.items = store.get("ledger", []);
	}
	append(fields) {
		const e = { seq: this.items.length + 1, ts: Date.now(), ...fields };
		this.items.push(e);
		this.store.set("ledger", this.items);
		emit("ledger", e);
		return e;
	}
	all() { return this.items; }
	byActor(actor) { return this.items.filter((e) => e.actor === actor); }
	/* Reverse every filesystem change after `seq`, newest first. */
	undoTo(seq, fs) {
		const later = this.items.filter((e) => e.seq > seq && e.kind.startsWith("fs.") && !e.undone).reverse();
		for (const e of later) {
			if (e.kind === "fs.write") fs.restore(e.path, e.before === null ? null : { type: "file", data: e.before, mtime: Date.now() });
			else if (e.kind === "fs.mkdir") fs.restore(e.path, null);
			else if (e.kind === "fs.rm") for (const [p, ent] of e.removed) fs.restore(p, ent);
			e.undone = true;
		}
		this.store.set("ledger", this.items);
		return this.append({ kind: "undo", actor: "user", to: seq, reversed: later.map((e) => e.seq) });
	}
	toJSONL() { return this.items.map((e) => JSON.stringify(e)).join("\n") + "\n"; }
}

/* --------------------------------------------------------------- vault */

/* API keys. Plain in the store by default, because a browser profile is
 * already the trust boundary for most people; sealed under a passphrase
 * with PBKDF2 and AES-GCM for those who want a second one. Nothing here
 * ever leaves the machine except in the header of a request the user
 * configured. */
export class Vault {
	constructor(store) {
		this.store = store;
		this.key = null;         // CryptoKey when a passphrase is set and unlocked
		this.cache = new Map();  // providerId -> plaintext key, this session only
	}
	get sealed() { return !!this.store.get("vault:salt"); }
	get locked() { return this.sealed && !this.key; }
	async deriveKey(pass, salt) {
		const base = await subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
		return subtle.deriveKey({ name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" }, base,
		                        { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
	}
	/* Turn on the passphrase: re-encrypts everything currently stored. */
	async seal(pass) {
		const ids = this.ids();
		const plain = {};
		for (const id of ids) plain[id] = await this.get(id);
		const salt = crypto.getRandomValues(new Uint8Array(16));
		this.key = await this.deriveKey(pass, salt);
		this.store.set("vault:salt", [...salt]);
		this.store.set("vault:check", await this._enc("resentment"));
		for (const id of ids) await this.set(id, plain[id]);
	}
	async unlock(pass) {
		const salt = new Uint8Array(this.store.get("vault:salt"));
		const key = await this.deriveKey(pass, salt);
		try {
			if (await this._dec(this.store.get("vault:check"), key) !== "resentment") return false;
		} catch { return false; }
		this.key = key;
		return true;
	}
	lock() { this.key = null; this.cache.clear(); }
	ids() { return this.store.keys("vault:key:").map((k) => k.slice(10)); }
	has(id) { return this.store.get("vault:key:" + id) !== undefined; }
	async set(id, value) {
		if (!value) { this.store.del("vault:key:" + id); this.cache.delete(id); return; }
		this.cache.set(id, value);
		this.store.set("vault:key:" + id, this.sealed ? await this._enc(value) : { plain: value });
	}
	async get(id) {
		if (this.cache.has(id)) return this.cache.get(id);
		const rec = this.store.get("vault:key:" + id);
		if (!rec) return "";
		if (rec.plain !== undefined) return rec.plain;
		if (!this.key) throw new Error("vault is locked");
		const v = await this._dec(rec, this.key);
		this.cache.set(id, v);
		return v;
	}
	async _enc(text) {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const ct = await subtle.encrypt({ name: "AES-GCM", iv }, this.key, enc.encode(text));
		return { iv: [...iv], ct: [...new Uint8Array(ct)] };
	}
	async _dec(rec, key) {
		const pt = await subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(rec.iv) }, key, new Uint8Array(rec.ct));
		return new TextDecoder().decode(pt);
	}
}

/* ------------------------------------------------------------- helpers */

export const uid = () => Math.random().toString(36).slice(2, 10);
export const fmtBytes = (n) => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB";
export const fmtLeft = (ms) => {
	if (ms <= 0) return "expired";
	const s = Math.ceil(ms / 1000);
	if (s < 60) return s + "s";
	const m = Math.floor(s / 60);
	if (m < 60) return m + "m " + (s % 60) + "s";
	return Math.floor(m / 60) + "h " + (m % 60) + "m";
};
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
