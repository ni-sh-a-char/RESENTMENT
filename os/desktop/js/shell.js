/* SPDX-License-Identifier: Apache-2.0
 * RESENTMENT OS - the terminal's command language.
 *
 * Deliberately small: a handful of verbs over the virtual filesystem, the
 * process table, the leases and the digest, plus `ai` and `kernel` to hand
 * a line to the agent or to the real kernel. It is one function so the
 * Terminal app and the agent's shell_run tool cannot disagree about what a
 * command does.
 */
import { normalize, dirname, fmtBytes, fmtLeft, VERSION, CODENAME } from "./core.js";

const HELP = `RESENTMENT OS ${VERSION} (${CODENAME}) - commands

  files     ls [path]  cat <file>  cd <dir>  pwd  tree [path]  mkdir <dir>
            touch <file>  write <file> <text...>  append <file> <text...>
            rm <path>  cp <a> <b>  mv <a> <b>  find <text>
  system    digest  snapshot [name]  snapshots  diff <a> <b>  date  motd  version
  agents    ps  kill <id>  pause <id>  resume <id>  leases  revoke <id>
  ai        ai <prompt...>        ask the default agent, reply lands in its window
  kernel    kernel <line>         send a line to the RESENTMENT kernel (needs the bridge)
  apps      open <app> [path]     files editor terminal settings agents ledger graph kernel about
  echo, clear, help`;

/* Split a line into words, honouring double quotes. */
export function words(line) {
	const out = [];
	const re = /"([^"]*)"|(\S+)/g;
	let m;
	while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1] : m[2]);
	return out;
}

export function makeShell(os, cwd = "/home") {
	const sh = { cwd };
	const abs = (p) => (p ? (p.startsWith("/") ? normalize(p) : normalize(sh.cwd + "/" + p)) : sh.cwd);
	const rest = (line, n) => { const w = words(line); return line.slice(line.indexOf(w[n - 1]) + w[n - 1].length).trim(); };

	sh.run = async (line, ctx = { actor: "user" }) => {
		const w = words(line.trim());
		if (!w.length) return "";
		const [cmd, ...args] = w;
		const fs = os.fs;
		switch (cmd) {
		case "help": return HELP;
		case "version": return `RESENTMENT OS ${VERSION} (${CODENAME})`;
		case "motd": return fs.read("/etc/motd").trim();
		case "date": return new Date().toString();
		case "echo": return args.join(" ");
		case "pwd": return sh.cwd;
		case "cd": {
			const p = abs(args[0] || "/home");
			const st = fs.stat(p);
			if (!st) throw new Error(`cd: no such directory: ${p}`);
			if (st.type !== "dir") throw new Error(`cd: not a directory: ${p}`);
			sh.cwd = p;
			return "";
		}
		case "ls": {
			const p = abs(args[0]);
			const st = fs.stat(p);
			if (st && st.type === "file") return p;
			return fs.list(p).map((e) => `${e.type === "dir" ? "d" : "-"}  ${fmtBytes(e.size).padStart(9)}  ${e.name}${e.type === "dir" ? "/" : ""}`).join("\n") || "(empty)";
		}
		case "tree": return fs.walk(abs(args[0])).map((e) => "  ".repeat(e.path.split("/").length - 2) + e.name + (e.type === "dir" ? "/" : "")).join("\n") || "(empty)";
		case "cat": if (!args[0]) throw new Error("cat: which file?"); return fs.read(abs(args[0]));
		case "mkdir": if (!args[0]) throw new Error("mkdir: which directory?"); fs.mkdir(abs(args[0]), ctx); return "";
		case "touch": if (!args[0]) throw new Error("touch: which file?"); if (!fs.exists(abs(args[0]))) fs.write(abs(args[0]), "", ctx); return "";
		case "write": if (args.length < 2) throw new Error("write <file> <text>"); fs.write(abs(args[0]), rest(line, 2), ctx); return "";
		case "append": {
			if (args.length < 2) throw new Error("append <file> <text>");
			const p = abs(args[0]);
			fs.write(p, (fs.exists(p) ? fs.read(p) : "") + rest(line, 2) + "\n", ctx);
			return "";
		}
		case "rm": if (!args[0]) throw new Error("rm: which path?"); fs.rm(abs(args[0]), ctx); return "";
		case "cp": if (args.length < 2) throw new Error("cp <from> <to>"); fs.write(abs(args[1]), fs.read(abs(args[0])), ctx); return "";
		case "mv": {
			if (args.length < 2) throw new Error("mv <from> <to>");
			const a = abs(args[0]), b = abs(args[1]);
			if (fs.stat(a)?.type === "dir") throw new Error("mv: directories are not movable yet; copy the files");
			fs.write(b, fs.read(a), ctx); fs.rm(a, ctx);
			return "";
		}
		case "find": {
			const q = args.join(" ").toLowerCase();
			if (!q) throw new Error("find <text>");
			return fs.walk("/").filter((e) => e.type === "file" && (e.path.toLowerCase().includes(q) || fs.read(e.path).toLowerCase().includes(q))).map((e) => e.path).join("\n") || "(nothing)";
		}
		case "digest": return os.digest || "(not computed yet)";
		case "snapshot": { const s = await os.snapshot(args[0] || ""); return `${s.name}  ${s.root}`; }
		case "snapshots": return (os.store.get("snapshots", [])).map((s) => `${s.name.padEnd(24)} ${s.root.slice(0, 16)}…  ${new Date(s.ts).toLocaleString()}`).join("\n") || "(none)";
		case "diff": {
			const snaps = os.store.get("snapshots", []);
			const a = snaps.find((s) => s.name === args[0]), b = snaps.find((s) => s.name === args[1]);
			if (!a || !b) throw new Error("diff <snapshot a> <snapshot b>");
			const d = os.diff(a.nodes, b.nodes);
			return ["added:   " + (d.added.join(", ") || "-"), "removed: " + (d.removed.join(", ") || "-"), "changed: " + (d.changed.join(", ") || "-")].join("\n");
		}
		case "ps": return ["  id  state     tokens/budget  calls  name"].concat(os.agents.list.map((a) =>
			`${String(a.id).padStart(4)}  ${a.state.padEnd(8)}  ${String(a.tokens).padStart(6)}/${a.budget}  ${String(a.calls).padStart(5)}  ${a.name}${a.reason ? "  (" + a.reason + ")" : ""}`)).join("\n");
		case "kill": case "pause": case "resume": {
			const a = os.agents.get(args[0]);
			if (!a) throw new Error(`${cmd}: no agent ${args[0]}`);
			a[cmd]();
			return `${cmd} ${a.id}`;
		}
		case "leases": return os.leases.list().map((l) => `${String(l.id).padStart(3)}  ${l.subject.padEnd(10)} ${l.scope.padEnd(9)} ${fmtLeft(l.until - Date.now())}`).join("\n") || "(no active leases)";
		case "revoke": os.leases.revoke(Number(args[0])); return "";
		case "open": if (!args[0]) throw new Error("open <app>"); os.ui.open(args[0], { path: args[1] && abs(args[1]) }); return "";
		case "ai": { const q = rest(line, 1); if (!q) throw new Error("ai <prompt>"); os.ui.ask(q); return "asked."; }
		case "kernel": { const q = rest(line, 1); if (!q) throw new Error("kernel <line>"); return await os.kernel.eval(q); }
		case "clear": return "\x0c";
		default: throw new Error(`${cmd}: unknown command. Try help, or ai ${line}`);
		}
	};
	return sh;
}
export { dirname };
