/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - the built-in apps.
 *
 * Each app is an object with an id, a name, an icon and an open() that
 * fills a window body. They all talk to the same `os` object the agent
 * talks to; nothing an app can do is something an agent cannot be granted.
 */
import { esc, on, fmtBytes, fmtLeft, dirname, basename, VERSION, CODENAME } from "./core.js";
import { PROVIDERS, byId, listModels, stream, userMsg } from "./providers.js";
import { SCOPES } from "./agent.js";
import { makeShell } from "./shell.js";

/* ------------------------------------------------------------- icons */

const I = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;
export const ICONS = {
	chat:     I('<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z"/><path d="M8 9h8M8 12.5h5"/>'),
	files:    I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
	editor:   I('<path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M14 4v5h5M8 13h8M8 17h5"/>'),
	terminal: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>'),
	settings: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
	agents:   I('<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/><path d="M17 4.5a3 3 0 0 1 0 6M20 20a5.5 5.5 0 0 0-3-5"/>'),
	ledger:   I('<path d="M6 3h12a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6"/>'),
	graph:    I('<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M11 7l-5 9M13 7l5 9M7 18h10"/>'),
	kernel:   I('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
	about:    I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
};

/* ---------------------------------------------------------- markdown */

/* The subset the models actually produce: headings, fences, lists, bold,
 * italics, code, links. Everything is escaped first. */
export function md(src) {
	const lines = String(src).replace(/\r/g, "").split("\n");
	const out = [];
	let i = 0, para = [], list = null;
	const inline = (t) => esc(t)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
		.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
	const flush = () => {
		if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; }
		if (list) { out.push(`</${list}>`); list = null; }
	};
	while (i < lines.length) {
		const l = lines[i];
		const fence = l.match(/^```(\w*)/);
		if (fence) {
			flush();
			const body = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
			i++;
			out.push(`<pre data-lang="${esc(fence[1])}"><button class="copy" type="button">copy</button><code>${esc(body.join("\n"))}</code></pre>`);
			continue;
		}
		const h = l.match(/^(#{1,4})\s+(.*)/);
		if (h) { flush(); out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`); i++; continue; }
		const li = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
		if (li) {
			const kind = /^\s*\d/.test(l) ? "ol" : "ul";
			if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; }
			if (list !== kind) { if (list) out.push(`</${list}>`); out.push(`<${kind}>`); list = kind; }
			out.push("<li>" + inline(li[1]) + "</li>");
			i++; continue;
		}
		if (!l.trim()) { flush(); i++; continue; }
		if (list) { out.push(`</${list}>`); list = null; }
		para.push(l.trim());
		i++;
	}
	flush();
	return out.join("\n");
}

const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];
const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/* -------------------------------------------------------------- chat */

const chat = {
	id: "chat", name: "Ask", icon: ICONS.chat, width: 760, height: 560,
	open(body, w, os) {
		const agent = w.args?.agent || os.agents.spawn({ name: w.args?.name || "Ask" });
		w.agent = agent;
		w.setTitle(agent.name + " · " + (agent.model || "no model"));
		body.innerHTML = `
			<div class="chat">
				<div class="chat-log"></div>
				<div class="chat-status"></div>
				<form class="chat-form">
					<textarea rows="1" placeholder="Ask anything. Shift+Enter for a new line." autofocus></textarea>
					<button type="submit" class="btn primary" aria-label="Send">${I('<path d="M5 12h13M13 6l6 6-6 6"/>')}</button>
				</form>
			</div>`;
		const log = $(body, ".chat-log"), status = $(body, ".chat-status"), form = $(body, ".chat-form"), ta = $(body, "textarea");
		let live = null;

		const bubble = (role, html) => { const b = el(`<div class="msg ${role}">${html}</div>`); log.appendChild(b); log.scrollTop = log.scrollHeight; return b; };
		const render = () => {
			log.innerHTML = "";
			for (const m of agent.messages) {
				for (const b of m.content) {
					if (b.type === "text" && b.text.trim()) bubble(m.role, m.role === "user" ? esc(b.text).replace(/\n/g, "<br>") : md(b.text));
					else if (b.type === "tool_use") bubble("tool", toolChip(b.name, b.input));
					else if (b.type === "tool_result") { const last = log.lastElementChild; if (last?.classList.contains("tool")) last.appendChild(el(`<div class="tool-out ${b.is_error ? "bad" : ""}">${esc(String(b.content).slice(0, 1200))}</div>`)); }
				}
			}
			live = null;
		};
		const toolChip = (name, input) => `<span class="chip">${ICONS[name.startsWith("fs") ? "files" : name.startsWith("kernel") ? "kernel" : name.startsWith("shell") ? "terminal" : "agents"]} ${esc(name)}</span> <code>${esc(JSON.stringify(input)).slice(0, 200)}</code>`;
		const setStatus = () => {
			const s = agent.state;
			status.innerHTML = `<span class="dot ${s}"></span> ${s}${agent.reason ? " · " + esc(agent.reason) : ""} <span class="muted">· ${agent.tokens.toLocaleString()} / ${agent.budget.toLocaleString()} tokens · ${agent.calls} tool calls</span>`
				+ (s === "paused" ? ` <button class="link" data-resume>resume</button>` : "")
				+ (!agent.provider || !agent.model ? ` <button class="link" data-settings>choose a model</button>` : "");
		};
		const off = on("agent", (d) => {
			if (d.agent !== agent) return;
			if (d.kind === "delta") {
				if (!live) live = bubble("assistant", "");
				live.dataset.text = (live.dataset.text || "") + d.text;
				live.innerHTML = md(live.dataset.text);
				log.scrollTop = log.scrollHeight;
			} else if (d.kind === "message" || d.kind === "tool") render();
			else if (d.kind === "error") bubble("err", esc(d.error));
			setStatus();
			w.setTitle(agent.name + " · " + (agent.model || "no model"));
		});
		w.onClose = () => { off(); if (agent.state === "idle") { /* keep in the process table; it can be reopened from Agents */ } };
		status.addEventListener("click", (e) => {
			if (e.target.matches("[data-resume]")) agent.resume();
			if (e.target.matches("[data-settings]")) os.ui.open("settings");
		});
		log.addEventListener("click", (e) => {
			const c = e.target.closest(".copy");
			if (c) { navigator.clipboard?.writeText(c.nextElementSibling.innerText); c.textContent = "copied"; setTimeout(() => (c.textContent = "copy"), 1200); }
		});
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const t = ta.value.trim();
			if (!t) return;
			ta.value = ""; ta.style.height = "";
			if (!agent.provider || !agent.model) { os.ui.notify("No model yet", "Open Settings and add a provider key first."); os.ui.open("settings"); return; }
			if (agent.state === "running" || agent.state === "waiting") { os.ui.notify("Busy", "This agent is still working. Open another Ask window for a parallel one."); return; }
			agent.send(t).catch((err) => bubble("err", esc(err.message)));
		});
		ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
		ta.addEventListener("input", () => { ta.style.height = ""; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; });
		render(); setStatus();
		if (w.args?.prompt) { ta.value = w.args.prompt; if (w.args.send) form.requestSubmit(); }
		setTimeout(() => ta.focus(), 50);
	},
};

/* ------------------------------------------------------------- files */

const files = {
	id: "files", name: "Files", icon: ICONS.files, single: true, width: 720, height: 460,
	open(body, w, os) {
		let cwd = w.args?.path && os.fs.stat(w.args.path)?.type === "dir" ? w.args.path : "/home";
		let selected = null;
		body.innerHTML = `
			<div class="files">
				<div class="toolbar">
					<nav class="crumbs"></nav>
					<span class="grow"></span>
					<button class="btn" data-act="newfile">New file</button>
					<button class="btn" data-act="newdir">New folder</button>
					<button class="btn" data-act="import">Import</button>
					<button class="btn" data-act="export" disabled>Export</button>
					<button class="btn danger" data-act="delete" disabled>Delete</button>
					<input type="file" multiple hidden>
				</div>
				<div class="list"></div>
			</div>`;
		const list = $(body, ".list"), crumbs = $(body, ".crumbs"), file = $(body, "input[type=file]");
		const draw = () => {
			const parts = cwd.split("/").filter(Boolean);
			crumbs.innerHTML = `<a data-p="/">/</a>` + parts.map((p, i) => `<a data-p="/${parts.slice(0, i + 1).join("/")}">${esc(p)}</a>`).join('<span class="sep">/</span>');
			list.innerHTML = os.fs.list(cwd).map((e) => `
				<div class="row ${e.path === selected ? "sel" : ""}" data-p="${esc(e.path)}" data-t="${e.type}">
					<span class="ic">${e.type === "dir" ? ICONS.files : ICONS.editor}</span>
					<span class="name">${esc(e.name)}</span>
					<span class="meta">${e.type === "dir" ? "" : fmtBytes(e.size)}</span>
					<span class="meta">${e.mtime ? new Date(e.mtime).toLocaleString() : ""}</span>
				</div>`).join("") || `<p class="muted pad">Empty folder.</p>`;
			$(body, "[data-act=delete]").disabled = $(body, "[data-act=export]").disabled = !selected;
		};
		w.reopen = () => { if (w.args?.path) { cwd = w.args.path; draw(); } };
		crumbs.addEventListener("click", (e) => { const a = e.target.closest("a"); if (a) { cwd = a.dataset.p; selected = null; draw(); } });
		list.addEventListener("click", (e) => { const r = e.target.closest(".row"); if (r) { selected = r.dataset.p; draw(); } });
		list.addEventListener("dblclick", (e) => {
			const r = e.target.closest(".row");
			if (!r) return;
			if (r.dataset.t === "dir") { cwd = r.dataset.p; selected = null; draw(); }
			else os.ui.open("editor", { path: r.dataset.p });
		});
		$(body, ".toolbar").addEventListener("click", async (e) => {
			const b = e.target.closest("button");
			if (!b) return;
			const act = b.dataset.act;
			if (act === "newfile") { const n = prompt("File name"); if (n) { const p = cwd + "/" + n; if (!os.fs.exists(p)) os.fs.write(p, ""); os.ui.open("editor", { path: p }); } }
			if (act === "newdir") { const n = prompt("Folder name"); if (n) os.fs.mkdir(cwd + "/" + n); }
			if (act === "import") file.click();
			if (act === "delete" && selected && confirm(`Delete ${selected}? It goes to the ledger and can be undone.`)) { os.fs.rm(selected); selected = null; }
			if (act === "export" && selected) {
				const st = os.fs.stat(selected);
				const blob = new Blob([st.type === "file" ? st.data : JSON.stringify(os.fs.walk(selected).filter((x) => x.type === "file").map((x) => [x.path, os.fs.read(x.path)]), null, 2)], { type: "text/plain" });
				const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = basename(selected) + (st.type === "dir" ? ".json" : ""); a.click();
			}
			draw();
		});
		file.addEventListener("change", async () => {
			for (const f of file.files) {
				if (f.size > 4 * 1024 * 1024) { os.ui.notify("Too large", `${f.name} is over 4 MB; the filesystem is text-first.`); continue; }
				os.fs.write(cwd + "/" + f.name, await f.text());
			}
			file.value = ""; draw();
		});
		w.onClose = on("fs", draw);
		draw();
	},
};

/* ------------------------------------------------------------ editor */

const editor = {
	id: "editor", name: "Editor", icon: ICONS.editor, width: 720, height: 520,
	open(body, w, os) {
		let path = w.args?.path || "/home/documents/untitled.md";
		body.innerHTML = `
			<div class="editor">
				<div class="toolbar">
					<input class="path" value="${esc(path)}" spellcheck="false">
					<button class="btn primary" data-act="save">Save</button>
					<button class="btn" data-act="ask">Ask about this</button>
					<span class="muted status"></span>
				</div>
				<textarea spellcheck="false"></textarea>
			</div>`;
		const ta = $(body, "textarea"), pathIn = $(body, ".path"), status = $(body, ".status");
		const load = () => { ta.value = os.fs.exists(path) && os.fs.stat(path).type === "file" ? os.fs.read(path) : ""; w.setTitle(basename(path)); status.textContent = ""; };
		const save = () => { path = pathIn.value.trim() || path; os.fs.write(path, ta.value); w.setTitle(basename(path)); status.textContent = "saved " + time(Date.now()); };
		$(body, ".toolbar").addEventListener("click", (e) => {
			const act = e.target.closest("button")?.dataset.act;
			if (act === "save") save();
			if (act === "ask") os.ui.open("chat", { prompt: `Read ${path} and `, name: basename(path) });
		});
		ta.addEventListener("keydown", (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
			if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("\t", s, ta.selectionEnd, "end"); }
		});
		ta.addEventListener("input", () => (status.textContent = "unsaved"));
		load();
		ta.focus();
	},
};

/* ---------------------------------------------------------- terminal */

const terminal = {
	id: "terminal", name: "Terminal", icon: ICONS.terminal, width: 720, height: 440,
	open(body, w, os) {
		const sh = makeShell(os);
		body.innerHTML = `<div class="term"><pre class="term-out"></pre><form class="term-in"><span class="ps">${esc(sh.cwd)} ›</span><input autocomplete="off" spellcheck="false" autofocus></form></div>`;
		const out = $(body, ".term-out"), form = $(body, "form"), input = $(body, "input"), ps = $(body, ".ps");
		const hist = [];
		let hi = 0;
		const print = (t, cls = "") => { if (t === "\x0c") { out.textContent = ""; return; } const s = document.createElement("span"); s.className = cls; s.textContent = t + "\n"; out.appendChild(s); out.scrollTop = out.scrollHeight; };
		print(`RESENTMENT OS ${VERSION} (${CODENAME}). Type help.`, "muted");
		form.addEventListener("submit", async (e) => {
			e.preventDefault();
			const line = input.value;
			input.value = "";
			if (!line.trim()) return;
			hist.push(line); hi = hist.length;
			print(`${sh.cwd} › ${line}`, "cmd");
			try { const r = await sh.run(line); if (r) print(r); }
			catch (err) { print(err.message, "bad"); }
			ps.textContent = sh.cwd + " ›";
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "ArrowUp") { hi = Math.max(0, hi - 1); input.value = hist[hi] || ""; e.preventDefault(); }
			if (e.key === "ArrowDown") { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ""; e.preventDefault(); }
			if (e.key === "l" && e.ctrlKey) { out.textContent = ""; e.preventDefault(); }
		});
		body.addEventListener("click", () => { if (!getSelection().toString()) input.focus(); });
	},
};

/* ---------------------------------------------------------- settings */

const settings = {
	id: "settings", name: "Settings", icon: ICONS.settings, single: true, width: 760, height: 600,
	open(body, w, os) {
		const s = os.settings;
		const provider = () => byId($(body, "[name=provider]").value);
		const custom = (id) => os.store.get("provider:" + id, {});
		body.innerHTML = `
			<div class="settings">
				<nav class="side">
					<a href="#model" class="cur">Model</a><a href="#you">You</a><a href="#agents">Agents</a><a href="#vault">Vault</a>
					<a href="#look">Appearance</a><a href="#kernel">Kernel</a><a href="#data">Data</a>
				</nav>
				<div class="pages">
				<section id="model">
					<h3>Model</h3>
					<p class="muted">Bring your own key. It is stored in this browser only and sent only to the provider you pick.</p>
					<label>Provider <select name="provider">${PROVIDERS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
					<p class="note muted"></p>
					<label class="keyrow">API key <input name="key" type="password" autocomplete="off" placeholder="paste your key"> <button class="btn" data-act="eye" type="button">show</button> <a class="keys" target="_blank" rel="noopener">get a key</a></label>
					<label>Base URL <input name="base" placeholder="leave empty for the default"></label>
					<label>Model <input name="model" list="models" placeholder="model id"> <datalist id="models"></datalist> <button class="btn" data-act="fetch" type="button">Fetch models</button></label>
					<div class="row-actions">
						<button class="btn primary" data-act="save" type="button">Save and use as default</button>
						<button class="btn" data-act="test" type="button">Test</button>
						<span class="muted result"></span>
					</div>
					<h4>Configured</h4>
					<div class="configured muted"></div>
					<label class="check"><input type="checkbox" name="anthropicFallbacks"> Anthropic: opt in to server-side refusal fallbacks (beta header <code>server-side-fallback-2026-07-01</code>). A declined request is re-run on another Claude model.</label>
				</section>
				<section id="you" hidden><h3>You</h3><label>What should the OS call you? <input name="name"></label></section>
				<section id="agents" hidden>
					<h3>Agents</h3>
					<label>Token budget per agent <input name="budgetTokens" type="number" min="1000" step="1000"></label>
					<p class="muted">An agent that reaches its budget pauses; you can raise it and resume. Input and output tokens both count.</p>
					<label>Default lease length, minutes <input name="leaseMinutes" type="number" min="1"></label>
					<p class="muted">When an agent asks for a permission this is the first option offered. Nothing is ever granted without a deadline.</p>
				</section>
				<section id="vault" hidden>
					<h3>Vault</h3>
					<p class="muted">Keys are stored plainly in this browser's storage unless you set a passphrase. With one, they are sealed with AES-GCM under a key derived with PBKDF2, and you unlock the vault once per session.</p>
					<div class="vault-state"></div>
					<label>Passphrase <input name="pass" type="password" autocomplete="new-password"></label>
					<div class="row-actions"><button class="btn primary" data-act="seal" type="button">Set passphrase</button><button class="btn" data-act="unlock" type="button">Unlock</button><button class="btn" data-act="lock" type="button">Lock</button><span class="muted vresult"></span></div>
				</section>
				<section id="look" hidden>
					<h3>Appearance</h3>
					<label>Theme <select name="theme"><option value="dark">Dark</option><option value="light">Light</option></select></label>
					<label>Accent <select name="accent"><option value="time">Keyed from the clock (changes through the day)</option><option value="fixed">Fixed</option></select></label>
					<p class="muted">The kernel derives its keys from the angles between clock hands. The desktop derives its colour the same way, so no two hours look quite alike.</p>
				</section>
				<section id="kernel" hidden>
					<h3>Kernel</h3>
					<label>Bridge URL <input name="kernelUrl"></label>
					<p class="muted">Run <code>make run</code> in the RESENTMENT checkout to boot the kernel under QEMU with the bridge on this address, then press Attach in the Kernel app.</p>
				</section>
				<section id="data" hidden>
					<h3>Data</h3>
					<p class="muted">Everything lives in this browser. Export gives you a JSON file of your files, settings, ledger and snapshots. Keys are never exported.</p>
					<div class="row-actions"><button class="btn" data-act="export" type="button">Export</button><button class="btn" data-act="import" type="button">Import</button><button class="btn danger" data-act="reset" type="button">Erase everything</button><input type="file" accept=".json" hidden></div>
				</section>
				</div>
			</div>`;

		/* navigation */
		$(body, ".side").addEventListener("click", (e) => {
			const a = e.target.closest("a"); if (!a) return; e.preventDefault();
			$$(body, ".side a").forEach((x) => x.classList.toggle("cur", x === a));
			$$(body, ".pages section").forEach((x) => (x.hidden = "#" + x.id !== a.getAttribute("href")));
		});
		if (w.args?.page) $(body, `.side a[href="#${w.args.page}"]`)?.click();

		/* model page */
		const sel = $(body, "[name=provider]"), keyIn = $(body, "[name=key]"), baseIn = $(body, "[name=base]"), modelIn = $(body, "[name=model]"), dl = $(body, "#models"), result = $(body, ".result");
		const showProvider = async () => {
			const p = provider(), c = custom(p.id);
			$(body, ".note").textContent = p.note || "";
			$(body, ".keys").href = p.keys || "#"; $(body, ".keys").hidden = !p.keys;
			$(body, ".keyrow").hidden = !!p.local;
			keyIn.value = p.local ? "" : (os.vault.locked ? "" : await os.vault.get(p.id).catch(() => ""));
			keyIn.placeholder = os.vault.locked ? "vault is locked" : "paste your key";
			baseIn.value = c.base || ""; baseIn.placeholder = p.base || "https://…/v1";
			modelIn.value = c.model || (s.get("provider") === p.id ? s.get("model") : "") || p.models[0] || "";
			dl.innerHTML = (c.models || p.models).map((m) => `<option value="${esc(m)}">`).join("");
			result.textContent = "";
		};
		const drawConfigured = () => {
			const ids = PROVIDERS.filter((p) => os.vault.has(p.id) || p.local || custom(p.id).model);
			$(body, ".configured").innerHTML = ids.map((p) => `<span class="chip ${s.get("provider") === p.id ? "on" : ""}">${esc(p.name)}${custom(p.id).model ? " · " + esc(custom(p.id).model) : ""}${s.get("provider") === p.id ? " · default" : ""}</span>`).join(" ") || "nothing yet";
		};
		sel.value = s.get("provider") || "anthropic";
		sel.addEventListener("change", showProvider);
		$(body, "#model").addEventListener("click", async (e) => {
			const act = e.target.closest("button")?.dataset.act;
			if (!act) return;
			const p = provider();
			if (act === "eye") { keyIn.type = keyIn.type === "password" ? "text" : "password"; e.target.textContent = keyIn.type === "password" ? "show" : "hide"; }
			if (act === "save") {
				if (!p.local) await os.vault.set(p.id, keyIn.value.trim());
				os.store.set("provider:" + p.id, { ...custom(p.id), base: baseIn.value.trim(), model: modelIn.value.trim() });
				s.set({ provider: p.id, model: modelIn.value.trim() });
				result.textContent = "saved. New Ask windows use " + p.name + " · " + modelIn.value.trim();
				drawConfigured();
			}
			if (act === "fetch") {
				result.textContent = "fetching…";
				try {
					const models = await listModels(p, keyIn.value.trim(), baseIn.value.trim());
					os.store.set("provider:" + p.id, { ...custom(p.id), models });
					dl.innerHTML = models.map((m) => `<option value="${esc(m)}">`).join("");
					result.textContent = models.length + " models. Pick one from the list.";
				} catch (err) { result.textContent = "could not list models: " + err.message; }
			}
			if (act === "test") {
				result.textContent = "testing…";
				try {
					let txt = "";
					for await (const ev of stream(p, { key: keyIn.value.trim(), base: baseIn.value.trim(), model: modelIn.value.trim(), messages: [userMsg("Reply with the single word OK.")], maxTokens: 64 }, os.fetch)) if (ev.type === "text") txt += ev.text;
					result.textContent = "works: " + txt.trim().slice(0, 80);
				} catch (err) { result.textContent = "failed: " + err.message; }
			}
		});
		const fb = $(body, "[name=anthropicFallbacks]");
		fb.checked = s.get("anthropicFallbacks");
		fb.addEventListener("change", () => s.set({ anthropicFallbacks: fb.checked }));
		showProvider(); drawConfigured();

		/* plain fields */
		for (const name of ["name", "budgetTokens", "leaseMinutes", "theme", "accent", "kernelUrl"]) {
			const f = $(body, `[name=${name}]`);
			f.value = s.get(name);
			f.addEventListener("change", () => s.set({ [name]: f.type === "number" ? Number(f.value) : f.value }));
		}

		/* vault */
		const vstate = $(body, ".vault-state"), vres = $(body, ".vresult"), pass = $(body, "[name=pass]");
		const drawVault = () => { vstate.innerHTML = `<span class="chip ${os.vault.sealed ? "on" : ""}">${os.vault.sealed ? (os.vault.locked ? "sealed · locked" : "sealed · unlocked") : "not sealed"}</span>`; };
		$(body, "#vault").addEventListener("click", async (e) => {
			const act = e.target.closest("button")?.dataset.act;
			if (!act) return;
			try {
				if (act === "seal") { if (pass.value.length < 8) throw new Error("use at least 8 characters"); await os.vault.seal(pass.value); vres.textContent = "sealed"; }
				if (act === "unlock") { vres.textContent = (await os.vault.unlock(pass.value)) ? "unlocked" : "wrong passphrase"; }
				if (act === "lock") { os.vault.lock(); vres.textContent = "locked"; }
			} catch (err) { vres.textContent = err.message; }
			pass.value = ""; drawVault(); showProvider();
		});
		drawVault();

		/* data */
		const fileIn = $(body, "#data input[type=file]");
		$(body, "#data").addEventListener("click", async (e) => {
			const act = e.target.closest("button")?.dataset.act;
			if (act === "export") {
				const dump = {};
				for (const k of os.store.keys()) if (!k.startsWith("vault:")) dump[k] = os.store.get(k);
				const a = document.createElement("a");
				a.href = URL.createObjectURL(new Blob([JSON.stringify({ resentment: VERSION, exported: new Date().toISOString(), store: dump }, null, 1)], { type: "application/json" }));
				a.download = "resentment-os.json"; a.click();
			}
			if (act === "import") fileIn.click();
			if (act === "reset" && confirm("Erase every file, setting, key and ledger entry in this browser?")) { os.store.clear(); location.reload(); }
		});
		fileIn.addEventListener("change", async () => {
			try {
				const j = JSON.parse(await fileIn.files[0].text());
				if (!j.store) throw new Error("not a RESENTMENT export");
				for (const [k, v] of Object.entries(j.store)) if (!k.startsWith("vault:")) os.store.set(k, v);
				location.reload();
			} catch (err) { os.ui.notify("Import failed", err.message); }
		});
	},
};

/* ------------------------------------------------------------ agents */

const agents = {
	id: "agents", name: "Agents", icon: ICONS.agents, single: true, width: 780, height: 480,
	open(body, w, os) {
		body.innerHTML = `<div class="agents"><h3>Processes</h3><table class="tbl procs"></table><h3>Leases</h3><p class="muted">Every permission an agent holds, and when it stops working on its own.</p><table class="tbl leases"></table></div>`;
		const procs = $(body, ".procs"), leases = $(body, ".leases");
		const draw = () => {
			procs.innerHTML = `<tr><th>id</th><th>name</th><th>state</th><th>model</th><th>tokens</th><th>calls</th><th>up</th><th></th></tr>` + os.agents.list.map((a) => `
				<tr><td>${a.id}</td><td>${esc(a.name)}</td><td><span class="dot ${a.state}"></span>${a.state}${a.reason ? `<div class="muted small">${esc(a.reason)}</div>` : ""}</td>
				<td class="muted">${esc(a.model || "-")}</td><td>${a.tokens.toLocaleString()}<span class="muted">/${a.budget.toLocaleString()}</span></td><td>${a.calls}</td><td class="muted">${fmtLeft(Date.now() - a.started)}</td>
				<td class="acts"><button class="link" data-a="${a.id}" data-act="open">open</button>${a.state === "running" ? `<button class="link" data-a="${a.id}" data-act="pause">pause</button>` : ""}${a.state === "paused" ? `<button class="link" data-a="${a.id}" data-act="resume">resume</button>` : ""}${a.state !== "killed" ? `<button class="link bad" data-a="${a.id}" data-act="kill">kill</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">No agents yet. Open Ask to start one.</td></tr>`;
			leases.innerHTML = `<tr><th>id</th><th>subject</th><th>scope</th><th>reason</th><th>expires in</th><th></th></tr>` + os.leases.list().map((l) => `
				<tr><td>${l.id}</td><td>${esc(l.subject)}</td><td><code>${esc(l.scope)}</code> <span class="muted">${esc(SCOPES[l.scope] || "")}</span></td><td class="muted">${esc(l.reason)}</td><td><span class="ring" style="--p:${Math.max(0, (l.until - Date.now()) / (l.until - l.since))}"></span>${fmtLeft(l.until - Date.now())}</td><td><button class="link bad" data-l="${l.id}">revoke</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">No active leases. Agents start with nothing.</td></tr>`;
		};
		body.addEventListener("click", (e) => {
			const b = e.target.closest("button"); if (!b) return;
			if (b.dataset.l) os.leases.revoke(Number(b.dataset.l));
			const a = os.agents.get(b.dataset.a);
			if (a) { if (b.dataset.act === "open") os.ui.open("chat", { agent: a }); else a[b.dataset.act](); }
			draw();
		});
		const tick = setInterval(draw, 1000);
		const off = on("agent", draw);
		w.onClose = () => { clearInterval(tick); off(); };
		draw();
	},
};

/* ------------------------------------------------------------ ledger */

const ledger = {
	id: "ledger", name: "Ledger", icon: ICONS.ledger, single: true, width: 820, height: 500,
	open(body, w, os) {
		body.innerHTML = `<div class="ledger"><div class="toolbar"><input class="filter" placeholder="filter by actor, kind or path"><span class="grow"></span><button class="btn" data-act="export">Export JSONL</button></div><table class="tbl"></table></div>`;
		const tbl = $(body, "table"), filter = $(body, ".filter");
		const detail = (e) => {
			if (e.kind === "tool" || e.kind === "tool.denied") return `<code>${esc(e.tool)}</code> ${esc(JSON.stringify(e.input || {})).slice(0, 120)}`;
			if (e.kind === "tool.error") return `<code>${esc(e.tool)}</code> <span class="bad">${esc(e.error)}</span>`;
			if (e.kind.startsWith("fs.")) return `<code>${esc(e.path)}</code>${e.undone ? ' <span class="muted">(undone)</span>' : ""}`;
			if (e.kind === "undo") return `reversed ${e.reversed.length} change(s) back to #${e.to}`;
			if (e.kind === "snapshot") return `<code>${esc(e.name)}</code> ${esc(e.root.slice(0, 16))}…`;
			return esc(JSON.stringify(e).slice(0, 120));
		};
		const draw = () => {
			const q = filter.value.toLowerCase();
			const rows = os.ledger.all().filter((e) => !q || JSON.stringify(e).toLowerCase().includes(q)).slice(-500).reverse();
			tbl.innerHTML = `<tr><th>#</th><th>when</th><th>actor</th><th>kind</th><th>what</th><th>cause</th><th></th></tr>` + rows.map((e) => `
				<tr><td>${e.seq}</td><td class="muted">${time(e.ts)}</td><td>${esc(e.actor || "")}</td><td><code>${esc(e.kind)}</code></td><td>${detail(e)}</td><td class="muted">${e.cause ? "#" + e.cause : ""}</td>
				<td>${e.kind.startsWith("fs.") && !e.undone ? `<button class="link" data-undo="${e.seq - 1}" title="Undo this and everything after it">undo to here</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Nothing yet.</td></tr>`;
		};
		filter.addEventListener("input", draw);
		body.addEventListener("click", (e) => {
			const b = e.target.closest("button"); if (!b) return;
			if (b.dataset.undo !== undefined && confirm("Reverse every file change after this point? The ledger keeps the record.")) { os.ledger.undoTo(Number(b.dataset.undo), os.fs); os.ui.notify("Undone", "Files restored. The undo is itself in the ledger."); }
			if (b.dataset.act === "export") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([os.ledger.toJSONL()], { type: "application/jsonl" })); a.download = "resentment-ledger.jsonl"; a.click(); }
			draw();
		});
		w.onClose = on("ledger", draw);
		draw();
	},
};

/* ------------------------------------------------------------- graph */

const graph = {
	id: "graph", name: "Digest", icon: ICONS.graph, single: true, width: 780, height: 540,
	open(body, w, os) {
		body.innerHTML = `
			<div class="graph">
				<div class="roots">
					<div class="root"><span class="lbl">this OS</span><code class="hash os-root"></code><span class="muted small">sha-256 over every file and setting, no timestamps, no keys</span></div>
					<div class="root"><span class="lbl">the kernel</span><code class="hash k-root muted">not attached</code><span class="muted small">the machine's own runtime graph root, read over the serial bridge</span></div>
				</div>
				<div class="toolbar"><input class="snapname" placeholder="snapshot name"><button class="btn primary" data-act="snap">Snapshot</button><span class="grow"></span><button class="btn" data-act="diff" disabled>Diff selected</button><button class="btn" data-act="attest">Attest</button></div>
				<table class="tbl snaps"></table>
				<pre class="diff" hidden></pre>
				<details><summary>Every node (${"click to expand"})</summary><pre class="nodes"></pre></details>
			</div>`;
		const snaps = $(body, ".snaps"), diff = $(body, ".diff");
		const picked = new Set();
		const draw = () => {
			$(body, ".os-root").textContent = os.digest || "…";
			$(body, ".k-root").textContent = os.kernel.attached ? (os.kernel.digest || "attached, no digest yet") : "not attached";
			$(body, ".k-root").classList.toggle("muted", !os.kernel.digest);
			const list = os.store.get("snapshots", []);
			snaps.innerHTML = `<tr><th></th><th>name</th><th>root</th><th>when</th><th>files</th></tr>` + list.map((s) => `
				<tr><td><input type="checkbox" data-n="${esc(s.name)}" ${picked.has(s.name) ? "checked" : ""}></td><td>${esc(s.name)}</td><td><code>${s.root.slice(0, 24)}…</code></td><td class="muted">${new Date(s.ts).toLocaleString()}</td><td class="muted">${Object.keys(s.nodes).length}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No snapshots. Take one, change something, take another, diff them.</td></tr>`;
			$(body, "[data-act=diff]").disabled = picked.size !== 2;
			$(body, ".nodes").textContent = Object.entries(os.nodes || {}).map(([p, h]) => h.slice(0, 16) + "  " + p).join("\n");
		};
		body.addEventListener("change", (e) => { const c = e.target.closest("input[type=checkbox]"); if (c) { c.checked ? picked.add(c.dataset.n) : picked.delete(c.dataset.n); draw(); } });
		body.addEventListener("click", async (e) => {
			const act = e.target.closest("button")?.dataset.act;
			if (act === "snap") { await os.snapshot($(body, ".snapname").value.trim()); $(body, ".snapname").value = ""; }
			if (act === "diff") {
				const [a, b] = [...picked].map((n) => os.store.get("snapshots", []).find((s) => s.name === n));
				const d = os.diff(a.nodes, b.nodes);
				diff.hidden = false;
				diff.textContent = `${a.name} → ${b.name}\n\n` + ["added", "removed", "changed"].map((k) => `${k}:\n` + (d[k].map((p) => "  " + p).join("\n") || "  (none)")).join("\n\n");
			}
			if (act === "attest") {
				const doc = { resentment_os: VERSION, attested: new Date().toISOString(), root: os.digest, tree: os.tree, settings: os.settingsDigest, kernel: os.kernel.digest || null, snapshots: os.store.get("snapshots", []).map((s) => ({ name: s.name, root: s.root, ts: s.ts })) };
				const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" })); a.download = "resentment-attestation.json"; a.click();
			}
			draw();
		});
		const off = on("digest", draw);
		w.onClose = off;
		draw();
	},
};

/* ------------------------------------------------------------ kernel */

const kernel = {
	id: "kernel", name: "Kernel", icon: ICONS.kernel, single: true, width: 800, height: 520,
	open(body, w, os) {
		body.innerHTML = `
			<div class="kernel">
				<div class="toolbar"><input class="url" value="${esc(os.settings.get("kernelUrl"))}"><button class="btn primary" data-act="attach">Attach</button><button class="btn" data-act="detach">Detach</button><span class="muted kstate"></span></div>
				<div class="quick">${[".help", ".digest", ".kaalka", ".ai", ".ps", ".mem", ".ls /graph", ".selftest", ".infer 8", ".run /boot/bin/facts.she"].map((c) => `<button class="chipbtn" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>
				<pre class="kout"></pre>
				<form class="kin"><span class="ps">resentment&gt;</span><input autocomplete="off" spellcheck="false" placeholder="a line of SHE, or a dot-command"></form>
				<div class="howto" hidden>
					<h4>Nothing attached</h4>
					<p>The kernel has a serial console and no network yet, so the desktop reaches it through a small bridge that relays the serial port over a WebSocket.</p>
					<pre>git clone --recursive -b v2.0.0 https://github.com/ni-sh-a-char/RESENTMENT.git
cd RESENTMENT
make toolchain     # once: fetches zig and nasm, no installer
make run           # builds the kernel, boots it under QEMU, serves this desktop on :7411</pre>
					<p>Then press <b>Attach</b>. A page served from anywhere may attach to <code>ws://localhost:7411/serial</code>.</p>
				</div>
			</div>`;
		const out = $(body, ".kout"), input = $(body, "input:not(.url)"), url = $(body, ".url"), state = $(body, ".kstate"), howto = $(body, ".howto");
		const k = os.kernel;
		const show = () => { state.textContent = k.attached ? "attached · " + (k.digest ? k.digest.slice(0, 16) + "…" : "") : "not attached"; howto.hidden = k.attached; };
		out.textContent = k.log;
		const off = k.onData((t) => { out.textContent = (out.textContent + t).slice(-65536); out.scrollTop = out.scrollHeight; show(); });
		const prev = k.onState; k.onState = (a) => { prev(a); show(); };
		body.addEventListener("click", async (e) => {
			const b = e.target.closest("button"); if (!b) return;
			if (b.dataset.act === "attach") { os.settings.set({ kernelUrl: url.value.trim() }); state.textContent = "connecting…"; try { await k.connect(url.value.trim()); } catch (err) { state.textContent = err.message; } }
			if (b.dataset.act === "detach") k.close();
			if (b.dataset.c) { input.value = b.dataset.c; $(body, ".kin").requestSubmit(); }
			show();
		});
		$(body, ".kin").addEventListener("submit", (e) => { e.preventDefault(); const l = input.value; input.value = ""; if (!k.attached) { os.ui.notify("Kernel", "Attach first."); return; } k.eval(l).catch((err) => { out.textContent += "\n[" + err.message + "]\n"; }); });
		w.onClose = () => { off(); k.onState = prev; };
		show();
		out.scrollTop = out.scrollHeight;
	},
};

/* ------------------------------------------------------------- about */

const about = {
	id: "about", name: "About", icon: ICONS.about, single: true, width: 640, height: 560,
	open(body, w, os) {
		body.innerHTML = `
			<div class="about">
				<div class="mark"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="2" opacity=".3" fill="none"/><circle cx="32" cy="32" r="3" fill="var(--accent)"/><path d="M32 32V12" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round"/><path d="M32 32l15 9" stroke="var(--accent-2)" stroke-width="3.5" stroke-linecap="round"/></svg></div>
				<h2>RESENTMENT OS <span class="ver">${VERSION} · ${CODENAME}</span></h2>
				<p class="lede">An AI operating system that runs on its own kernel and on your own key. Apache 2.0, no server, no telemetry.</p>
				<ul class="ideas">
					<li><b>Authority expires.</b> Every permission an agent holds is a lease with a deadline, like every capability in the kernel is a seal with a window.</li>
					<li><b>The system is a hash.</b> Your whole OS has one SHA-256 root. Snapshot it, diff it, attest it. The kernel has the same for the machine.</li>
					<li><b>Agents are processes.</b> They have budgets, states, a place in the process table, and a kill button.</li>
					<li><b>Nothing is forgotten.</b> Every action is a ledger entry with a cause. Undo is a new entry, not a deletion.</li>
				</ul>
				<div class="row-actions"><button class="btn primary" data-act="setup">Set up a model</button><a class="btn" href="https://ni-sh-a-char.github.io/RESENTMENT/" target="_blank" rel="noopener">Website</a><a class="btn" href="https://github.com/ni-sh-a-char/RESENTMENT" target="_blank" rel="noopener">GitHub</a><a class="btn" href="https://github.com/ni-sh-a-char/RESENTMENT---kernel" target="_blank" rel="noopener">The kernel</a></div>
				<h4>Keyboard</h4>
				<table class="tbl keys"><tr><td><kbd>Ctrl</kbd> <kbd>K</kbd></td><td>the intent bar: open an app, run a command, or ask</td></tr><tr><td><kbd>Enter</kbd></td><td>send · <kbd>Shift</kbd> <kbd>Enter</kbd> new line</td></tr><tr><td><kbd>Ctrl</kbd> <kbd>S</kbd></td><td>save in the editor</td></tr><tr><td><kbd>Esc</kbd></td><td>close the intent bar or a dialog</td></tr></table>
				<p class="muted small">Kernel: <a href="https://github.com/ni-sh-a-char/RESENTMENT---kernel" target="_blank" rel="noopener">RESENTMENT 2.0.0 "kaalachakra"</a>, a capability-secure, AI-native kernel for x86_64, ARM64 and RISC-V. Made by <a href="https://github.com/PIYUSH-MISHRA-00" target="_blank" rel="noopener">Piyush Mishra</a>.</p>
			</div>`;
		$(body, "[data-act=setup]").addEventListener("click", () => os.ui.open("settings"));
	},
};

export const APPS = [chat, files, editor, terminal, settings, agents, ledger, graph, kernel, about];
export const appById = (id) => APPS.find((a) => a.id === id);
export { dirname };
