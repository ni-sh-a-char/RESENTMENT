/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - the window manager.
 *
 * Windows are divs. Dragging is pointer events on the title bar; resizing
 * is the browser's own `resize: both`, because a hand-written resize
 * handle is two hundred lines that CSS already ships. On a narrow screen
 * every window is full-screen and the dock becomes the switcher.
 */
import { esc } from "./core.js";

export class WM {
	constructor(root) {
		this.root = root;
		this.windows = new Map();
		this.z = 10;
		this.n = 0;
		this.onChange = () => {};
	}
	get narrow() { return window.innerWidth < 720; }

	open(spec) {
		if (spec.single) {
			const have = [...this.windows.values()].find((w) => w.app === spec.app);
			if (have) { have.args = spec.args; if (spec.reopen) spec.reopen(have); this.focus(have); return have; }
		}
		const id = ++this.n;
		const el = document.createElement("section");
		el.className = "win";
		el.setAttribute("role", "dialog");
		el.setAttribute("aria-label", spec.title);
		el.innerHTML = `
			<header class="win-bar">
				<span class="win-icon">${spec.icon || ""}</span>
				<span class="win-title">${esc(spec.title)}</span>
				<span class="win-ctl">
					<button data-act="min" aria-label="Minimise" title="Minimise"><svg viewBox="0 0 12 12"><path d="M2 8.5h8"/></svg></button>
					<button data-act="max" aria-label="Maximise" title="Maximise"><svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/></svg></button>
					<button data-act="close" aria-label="Close" title="Close"><svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6"/></svg></button>
				</span>
			</header>
			<div class="win-body"></div>`;
		const w = { id, app: spec.app, title: spec.title, icon: spec.icon, el, body: el.querySelector(".win-body"),
		            args: spec.args, minimized: false, maximized: false, onClose: null };
		w.setTitle = (t) => { w.title = t; el.querySelector(".win-title").textContent = t; this.onChange(); };
		w.close = () => this.close(w);
		w.focus = () => this.focus(w);

		const width = Math.min(spec.width || 720, window.innerWidth - 24);
		const height = Math.min(spec.height || 480, window.innerHeight - 100);
		const cascade = (this.n % 8) * 28;
		el.style.width = width + "px";
		el.style.height = height + "px";
		el.style.left = Math.max(12, Math.min((window.innerWidth - width) / 2 + cascade - 80, window.innerWidth - width - 12)) + "px";
		el.style.top = Math.max(48, Math.min(90 + cascade, window.innerHeight - height - 80)) + "px";

		el.addEventListener("pointerdown", () => this.focus(w), true);
		el.querySelector(".win-ctl").addEventListener("click", (e) => {
			const b = e.target.closest("button");
			if (!b) return;
			if (b.dataset.act === "close") this.close(w);
			else if (b.dataset.act === "min") this.minimize(w);
			else this.maximize(w);
		});
		el.querySelector(".win-bar").addEventListener("dblclick", (e) => { if (!e.target.closest("button")) this.maximize(w); });
		this._drag(w);

		this.root.appendChild(el);
		this.windows.set(id, w);
		if (this.narrow) this.maximize(w, true);
		this.focus(w);
		try { spec.body(w.body, w); } catch (e) { w.body.innerHTML = `<p class="err">${esc(e.message)}</p>`; console.error(e); }
		/* A window that just opened should take the keyboard: the dock button
		 * that opened it would otherwise keep focus, and Enter would open a
		 * second one. */
		const first = w.body.querySelector("textarea, input:not([type=hidden]):not([type=file]):not([type=checkbox])");
		if (first) setTimeout(() => first.focus(), 0);
		this.onChange();
		return w;
	}

	_drag(w) {
		const bar = w.el.querySelector(".win-bar");
		let sx, sy, ox, oy, moving = false;
		bar.addEventListener("pointerdown", (e) => {
			if (e.target.closest("button") || w.maximized) return;
			moving = true;
			sx = e.clientX; sy = e.clientY;
			ox = w.el.offsetLeft; oy = w.el.offsetTop;
			bar.setPointerCapture(e.pointerId);
			w.el.classList.add("moving");
		});
		bar.addEventListener("pointermove", (e) => {
			if (!moving) return;
			w.el.style.left = Math.max(-w.el.offsetWidth + 80, Math.min(ox + e.clientX - sx, window.innerWidth - 80)) + "px";
			w.el.style.top = Math.max(36, Math.min(oy + e.clientY - sy, window.innerHeight - 40)) + "px";
		});
		const up = () => { moving = false; w.el.classList.remove("moving"); };
		bar.addEventListener("pointerup", up);
		bar.addEventListener("pointercancel", up);
	}

	focus(w) {
		if (w.minimized) { w.minimized = false; w.el.classList.remove("min"); }
		for (const o of this.windows.values()) o.el.classList.toggle("active", o === w);
		w.el.style.zIndex = ++this.z;
		this.active = w;
		this.onChange();
	}
	minimize(w) {
		w.minimized = true;
		w.el.classList.add("min");
		w.el.classList.remove("active");
		const next = [...this.windows.values()].filter((o) => !o.minimized).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
		if (next) this.focus(next); else this.onChange();
	}
	maximize(w, force) {
		w.maximized = force ? true : !w.maximized;
		w.el.classList.toggle("max", w.maximized);
		this.onChange();
	}
	close(w) {
		if (w.onClose) w.onClose();
		w.el.remove();
		this.windows.delete(w.id);
		const next = [...this.windows.values()].filter((o) => !o.minimized).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
		if (next) this.focus(next); else { this.active = null; this.onChange(); }
	}
	byApp(app) { return [...this.windows.values()].filter((w) => w.app === app); }
}
