/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - boot.
 *
 * Builds the `os` object every app and every agent talks to, draws the
 * shell around the windows (top bar, dock, intent bar, lease dialog,
 * notifications, wallpaper) and hands control to the user.
 */
import { Store, idbBackend, Settings, FS, Leases, Ledger, Vault, digestOS, diffNodes, on, emit, esc, fmtLeft, VERSION } from "./core.js";
import { Agents, SCOPES } from "./agent.js";
import { KernelLink } from "./kernel.js";
import { makeShell } from "./shell.js";
import { WM } from "./wm.js";
import { APPS, appById, ICONS } from "./apps.js";

const $ = (s) => document.querySelector(s);

const root = document.documentElement;

async function boot() {
	let store;
	try { store = await new Store(idbBackend()).open(); }
	catch { store = new Store(); }   /* private window or storage blocked: still works, forgets on close */

	const ledger = new Ledger(store);
	const fs = new FS(store, ledger).init();
	const settings = new Settings(store);
	const os = {
		store, fs, ledger, settings, vault: new Vault(store), leases: new Leases(),
		fetch: (...a) => fetch(...a), diff: diffNodes, digest: "", tree: "", settingsDigest: "", nodes: {},
		kernel: new KernelLink(settings.get("kernelUrl")),
	};
	os.agents = new Agents(os);
	const agentShell = makeShell(os, "/home");
	os.shell = (line, ctx) => agentShell.run(line, ctx);
	os.snapshot = async (name) => {
		await recompute();
		const list = store.get("snapshots", []);
		const s = { name: name || "snapshot " + (list.length + 1), root: os.digest, nodes: os.nodes, ts: Date.now() };
		store.set("snapshots", [...list, s]);
		ledger.append({ kind: "snapshot", actor: "user", name: s.name, root: s.root });
		emit("digest", os.digest);
		return s;
	};

	/* ---------------------------------------------------------- digest */
	let pending = null;
	const recompute = async () => {
		const d = await digestOS(fs, settings);
		os.digest = d.root; os.tree = d.tree; os.settingsDigest = d.settings; os.nodes = d.nodes;
		$("#digest").textContent = d.root.slice(0, 12) + "…";
		$("#digest").title = d.root;
		emit("digest", d.root);
	};
	const schedule = () => { clearTimeout(pending); pending = setTimeout(recompute, 150); };
	on("fs", schedule); on("settings", schedule);
	await recompute();

	/* -------------------------------------------------------- windows */
	const wm = new WM($("#windows"));
	os.ui = {
		open(id, args = {}) {
			const app = appById(id);
			if (!app) { os.ui.notify("No such app", id); return; }
			return wm.open({ app: app.id, title: app.name, icon: app.icon, width: app.width, height: app.height, single: app.single, args,
			                 reopen: (w) => app.reopen && app.reopen(w), body: (body, w) => app.open(body, w, os) });
		},
		notify(title, body = "", ms = 6000) {
			const n = document.createElement("div");
			n.className = "toast";
			n.innerHTML = `<b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ""}`;
			$("#toasts").appendChild(n);
			setTimeout(() => n.classList.add("out"), ms - 400);
			setTimeout(() => n.remove(), ms);
		},
		ask(text) { os.ui.open("chat", { prompt: text, send: true }); },
		askLease(agent, scope, call) { return leaseDialog(agent, scope, call); },
	};

	/* --------------------------------------------------- lease dialog */
	const dlg = $("#lease");
	let queue = Promise.resolve();
	function leaseDialog(agent, scope, call) {
		const run = () => new Promise((resolve) => {
			const mins = settings.get("leaseMinutes");
			const opts = [[5, "5 min"], [mins, mins + " min"], [60, "1 hour"], [480, "8 hours"]].filter(([m], i, a) => a.findIndex((x) => x[0] === m) === i).sort((a, b) => a[0] - b[0]);
			dlg.innerHTML = `
				<div class="dlg">
					<div class="dlg-head"><span class="dot waiting"></span> <b>${esc(agent.name)}</b> <span class="muted">(agent ${agent.id}) wants to</span></div>
					<h3>${esc(SCOPES[scope] || scope)}</h3>
					<div class="call"><code>${esc(call.name)}</code> <span>${esc(JSON.stringify(call.input || {})).slice(0, 300)}</span></div>
					<p class="muted">Whatever you grant expires on its own. Scope <code>${esc(scope)}</code>, this agent only.</p>
					<div class="dlg-acts">${opts.map(([m, l]) => `<button class="btn ${m === mins ? "primary" : ""}" data-m="${m}">${l}</button>`).join("")}<span class="grow"></span><button class="btn danger" data-m="0">Deny</button></div>
				</div>`;
			dlg.hidden = false;
			const done = (m) => {
				dlg.hidden = true; dlg.innerHTML = "";
				document.removeEventListener("keydown", key);
				if (!m) { os.ui.notify("Denied", `${agent.name} did not get ${scope}.`); resolve(null); return; }
				const l = os.leases.grant(agent.subject, scope, m * 60000, call.name);
				os.ui.notify("Lease granted", `${agent.name} may ${SCOPES[scope] || scope} for ${fmtLeft(m * 60000)}.`);
				resolve(l);
			};
			const key = (e) => { if (e.key === "Escape") done(0); };
			document.addEventListener("keydown", key);
			dlg.querySelector(".dlg-acts").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) done(Number(b.dataset.m)); });
			dlg.querySelector(".btn.primary")?.focus();
		});
		queue = queue.then(run, run);
		return queue;
	}

	/* ------------------------------------------------------------ dock */
	const dock = $("#dock");
	dock.innerHTML = APPS.map((a) => `<button data-app="${a.id}" title="${esc(a.name)}" aria-label="${esc(a.name)}">${a.icon}<i></i></button>`).join("");
	dock.addEventListener("click", (e) => {
		const b = e.target.closest("button"); if (!b) return;
		const open = wm.byApp(b.dataset.app);
		if (open.length && appById(b.dataset.app).single) { const w = open[0]; if (wm.active === w && !w.minimized) wm.minimize(w); else wm.focus(w); }
		else if (open.length && !e.shiftKey && open.some((w) => w.minimized || wm.active !== w)) wm.focus(open.find((w) => w.minimized) || open[0]);
		else os.ui.open(b.dataset.app);
	});
	wm.onChange = () => {
		for (const b of dock.querySelectorAll("button")) {
			const ws = wm.byApp(b.dataset.app);
			b.classList.toggle("open", ws.length > 0);
			b.classList.toggle("active", ws.some((w) => w === wm.active && !w.minimized));
		}
		$("#winlist").innerHTML = [...wm.windows.values()].map((w) => `<button data-w="${w.id}" class="${w === wm.active && !w.minimized ? "cur" : ""}${w.minimized ? " min" : ""}">${w.icon}<span>${esc(w.title)}</span></button>`).join("");
	};
	$("#winlist").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) wm.focus(wm.windows.get(Number(b.dataset.w))); });

	/* ---------------------------------------------------- intent bar */
	const intent = $("#intent"), input = $("#intent input"), results = $("#intent .results");
	let items = [];
	const openIntent = () => { intent.hidden = false; input.value = ""; suggest(); setTimeout(() => input.focus(), 10); };
	const closeIntent = () => { intent.hidden = true; };
	const suggest = () => {
		const q = input.value.trim();
		const ql = q.toLowerCase();
		items = [];
		if (q.startsWith(">")) items.push({ label: "Run in terminal: " + q.slice(1).trim(), icon: ICONS.terminal, run: async () => { try { const r = await agentShell.run(q.slice(1)); os.ui.notify("› " + q.slice(1).trim(), r.slice(0, 300) || "done"); } catch (err) { os.ui.notify("Error", err.message); } } });
		for (const a of APPS) if (!q || a.name.toLowerCase().includes(ql) || a.id.includes(ql)) items.push({ label: "Open " + a.name, icon: a.icon, run: () => os.ui.open(a.id) });
		if (q) for (const f of fs.walk("/").filter((e) => e.type === "file" && e.path.toLowerCase().includes(ql)).slice(0, 4)) items.push({ label: "Edit " + f.path, icon: ICONS.editor, run: () => os.ui.open("editor", { path: f.path }) });
		if (q && !q.startsWith(">")) items.unshift({ label: "Ask: " + q, icon: ICONS.chat, run: () => os.ui.ask(q) });
		results.innerHTML = items.slice(0, 9).map((it, i) => `<button class="${i === 0 ? "cur" : ""}" data-i="${i}">${it.icon}<span>${esc(it.label)}</span></button>`).join("");
	};
	let cur = 0;
	input.addEventListener("input", () => { cur = 0; suggest(); });
	input.addEventListener("keydown", (e) => {
		const n = Math.min(items.length, 9);
		if (e.key === "ArrowDown") { cur = (cur + 1) % n; e.preventDefault(); }
		else if (e.key === "ArrowUp") { cur = (cur - 1 + n) % n; e.preventDefault(); }
		else if (e.key === "Enter") { e.preventDefault(); const it = items[cur]; closeIntent(); if (it) it.run(); return; }
		else if (e.key === "Escape") { closeIntent(); return; }
		else return;
		results.querySelectorAll("button").forEach((b, i) => b.classList.toggle("cur", i === cur));
	});
	results.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { const it = items[Number(b.dataset.i)]; closeIntent(); it.run(); } });
	intent.addEventListener("click", (e) => { if (e.target === intent) closeIntent(); });
	$("#intent-btn").addEventListener("click", openIntent);
	document.addEventListener("keydown", (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); intent.hidden ? openIntent() : closeIntent(); }
		if (e.key === "Escape" && !intent.hidden) closeIntent();
	});

	/* ---------------------------------------------------------- top bar */
	$("#brand").addEventListener("click", () => os.ui.open("about"));
	$("#digest").addEventListener("click", () => os.ui.open("graph"));
	$("#kstate").addEventListener("click", () => os.ui.open("kernel"));
	$("#leases").addEventListener("click", () => os.ui.open("agents"));
	os.kernel.onState = (a) => { $("#kstate").classList.toggle("on", a); $("#kstate").title = a ? "kernel attached" : "kernel not attached"; };
	const tick = () => {
		const n = new Date();
		$("#clock").textContent = n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
		$("#clock").title = n.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
		const ls = os.leases.list();
		const soon = ls.length ? Math.min(...ls.map((l) => l.until)) - Date.now() : 0;
		$("#leases").textContent = ls.length ? `${ls.length} lease${ls.length > 1 ? "s" : ""} · ${fmtLeft(soon)}` : "no leases";
		$("#leases").classList.toggle("on", ls.length > 0);
		const running = os.agents.running().length;
		$("#procs").textContent = running ? `${running} working` : "";
		hue(n);
	};
	setInterval(tick, 1000); tick();

	/* --------------------------------------------- theme and the clock */
	const applyTheme = () => { root.setAttribute("data-theme", settings.get("theme")); try { localStorage.setItem("resentment-theme", settings.get("theme")); } catch { /* blocked */ } };
	on("settings", applyTheme); applyTheme();
	function hue(n) {
		if (settings.get("accent") !== "time") { root.style.setProperty("--hue", 200); root.style.setProperty("--hue-2", 40); return; }
		/* Kaalka keys from the separations between the clock hands. The
		 * hour-minute separation picks the hue; it sweeps the wheel about
		 * eleven times a day, so mornings and evenings never match. */
		const m = n.getMinutes() + n.getSeconds() / 60, h = (n.getHours() % 12) + m / 60;
		const sep = Math.abs(h * 30 - m * 6) % 360;
		const d = sep > 180 ? 360 - sep : sep;
		/* 0° apart is the kernel's own cyan and brass; the separation then
		 * walks the primary through blue, violet and rose, and the second
		 * accent stays 160° behind it so the two never blur together. */
		const hue = Math.round(200 + d * 0.89);
		root.style.setProperty("--hue", hue);
		root.style.setProperty("--hue-2", hue - 160);
	}
	wallpaper();

	/* ---------------------------------------------------------- first run */
	if (!settings.get("onboarded")) {
		settings.set({ onboarded: true });
		os.ui.open("about");
		os.ui.open("editor", { path: "/home/README.md" });
		setTimeout(() => os.ui.notify("Welcome", "Press Ctrl+K to ask anything. Add a key in Settings to bring a model."), 800);
	} else {
		os.ui.open("chat");
	}
	if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => {});
	window.os = os;    /* for the curious, and for the console */
	$("#boot").classList.add("done");
	console.log(`RESENTMENT OS ${VERSION}. window.os is yours.`);
}

/* The wallpaper: the actual clock, drawn as arcs, because the kernel keys
 * its authority from these angles and the desktop keys its colour from
 * them. Redrawn once a second; it is a few hundred pixels of arc. */
function wallpaper() {
	const c = $("#wall"), ctx = c.getContext("2d");
	const draw = () => {
		const w = c.width = innerWidth, h = c.height = innerHeight;
		const cs = getComputedStyle(document.documentElement);
		const hue = cs.getPropertyValue("--hue") || 38, hue2 = cs.getPropertyValue("--hue-2") || 180;
		const light = document.documentElement.getAttribute("data-theme") === "light";
		ctx.clearRect(0, 0, w, h);
		const g = ctx.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, Math.max(w, h));
		g.addColorStop(0, light ? `hsl(${hue} 60% 92%)` : `hsl(${hue} 40% 12%)`);
		g.addColorStop(0.5, light ? "#eef0f5" : "#0a0c11");
		g.addColorStop(1, light ? "#e6e9f0" : "#05060a");
		ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
		const n = new Date(), s = n.getSeconds() + n.getMilliseconds() / 1000, m = n.getMinutes() + s / 60, hr = (n.getHours() % 12) + m / 60;
		const cx = w * 0.72, cy = h * 0.42, R = Math.min(w, h) * 0.34;
		ctx.lineCap = "round";
		const arc = (frac, r, color, width) => { ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke(); };
		const a = light ? 0.35 : 0.5;
		arc(1, R, light ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.04)", 1);
		arc(1, R * 0.78, light ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.04)", 1);
		arc(1, R * 0.56, light ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.04)", 1);
		arc(hr / 12, R * 0.56, `hsl(${hue} 70% 60% / ${a})`, 10);
		arc(m / 60, R * 0.78, `hsl(${hue2} 60% 60% / ${a * 0.8})`, 6);
		arc(s / 60, R, `hsl(${hue} 60% 70% / ${a * 0.5})`, 2);
	};
	draw();
	setInterval(draw, 1000);
	addEventListener("resize", draw);
	on("settings", () => setTimeout(draw, 50));
}

boot().catch((e) => { document.body.innerHTML = `<pre style="padding:2rem;color:#f66">RESENTMENT OS failed to boot:\n${esc(e.stack || e.message)}</pre>`; });
