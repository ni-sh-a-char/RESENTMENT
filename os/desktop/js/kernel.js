/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - the link to the real kernel.
 *
 * The kernel has a serial console and no network stack yet, so the desktop
 * reaches it the way the kernel's own test harness does: a byte stream to
 * the serial port, here carried over a WebSocket that os/bridge/bridge.py
 * relays. Every byte the kernel prints arrives through onData; eval() types
 * a line, waits for the next prompt and returns what came back in between.
 * One command at a time, in order, which is what a serial line is.
 */

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
export const PROMPT = /(^|\n)(resentment> |        \.\.\. )$/;

export class KernelLink {
	constructor(url, WS = globalThis.WebSocket) {
		this.url = url;
		this.WS = WS;
		this.ws = null;
		this.attached = false;
		this.log = "";             // everything received, capped
		this.listeners = new Set();
		this.queue = [];           // {line, resolve, reject, timer, mark}
		this.current = null;
		this.digest = "";          // last .digest seen, for the top bar
		this.onState = () => {};
	}
	onData(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

	connect(url) {
		if (url) this.url = url;
		this.close();
		return new Promise((resolve, reject) => {
			let ws;
			try { ws = new this.WS(this.url); } catch (e) { reject(e); return; }
			ws.binaryType = "arraybuffer";
			this.ws = ws;
			ws.onopen = () => { this.attached = true; this.onState(true); resolve(); };
			ws.onerror = () => { if (!this.attached) reject(new Error("could not connect to " + this.url)); };
			ws.onclose = () => { this.attached = false; this.onState(false); this._failAll("kernel link closed"); };
			ws.onmessage = (e) => this._recv(typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data));
		});
	}
	close() { if (this.ws) { try { this.ws.close(); } catch { /* already gone */ } this.ws = null; } this.attached = false; }

	_recv(text) {
		const clean = text.replace(ANSI, "").replace(/\r/g, "");
		this.log = (this.log + clean).slice(-65536);
		for (const fn of this.listeners) fn(clean);
		const m = clean.match(/\b[0-9a-f]{64}\b/);
		if (m) this.digest = m[0];
		if (this.current && PROMPT.test(this.log)) this._finish();
	}
	_finish() {
		const c = this.current;
		this.current = null;
		clearTimeout(c.timer);
		let out = this.log.slice(c.mark).replace(PROMPT, "");
		/* The serial line echoes what was typed; drop that first line. */
		const nl = out.indexOf("\n");
		if (nl >= 0 && out.slice(0, nl).trim().endsWith(c.line.trim())) out = out.slice(nl + 1);
		c.resolve(out.trim());
		this._next();
	}
	_next() {
		if (this.current || !this.queue.length) return;
		const c = this.queue.shift();
		this.current = c;
		c.mark = this.log.length;
		c.timer = setTimeout(() => { this.current = null; c.reject(new Error("kernel did not answer in time")); this._next(); }, c.timeout);
		this.ws.send(c.line + "\r");
	}
	_failAll(msg) {
		for (const c of [this.current, ...this.queue].filter(Boolean)) { clearTimeout(c.timer); c.reject(new Error(msg)); }
		this.queue = []; this.current = null;
	}

	/* Type one line and return the reply. */
	eval(line, timeout = 20000) {
		if (!this.attached) return Promise.reject(new Error("kernel not attached. Run `make run` in the RESENTMENT checkout and press Attach in the Kernel app."));
		return new Promise((resolve, reject) => { this.queue.push({ line, resolve, reject, timeout }); this._next(); });
	}
	/* Raw keystrokes from the console window, not a command. */
	type(text) { if (this.ws && this.attached) this.ws.send(text); }
}
