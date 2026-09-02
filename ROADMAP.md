# Roadmap

What is done, what is next, and what this project deliberately will not do.
Dates are absent on purpose. This is a roadmap of order, not of schedule.

---

## Done — shipped in 2.0.0

- A desktop in the browser: windows, dock, intent bar, ten apps, offline,
  light and dark, an accent keyed from the clock
- Any provider: Anthropic, Gemini, and every `/chat/completions` server
  including local ones; streaming and tool calls on all three wire formats
- Leases: every permission an agent holds expires
- The digest: one SHA-256 root for the OS; snapshots, diff, attestation
- Agents as processes: budgets, states, pause, resume, kill
- The ledger: every action with its cause; undo as an entry
- The vault: keys plain or sealed under a passphrase
- The bridge: the real kernel under QEMU, its serial line over a WebSocket,
  a live console and a `kernel_eval` tool
- The OS's SHE programs in the kernel's ramdisk, through `USER_EXTRA`
- CI that boots the kernel with the OS ramdisk and drives it through the
  bridge on every push

---

## Next

### 1. The kernel does more, so the desktop can lean on it

Waiting on the kernel's own roadmap, in its order: PCI, virtio-net and
virtio-blk, a block layer, an IPv4 stack.

- **A `kernel_fs` tool** the moment the kernel has a persistent filesystem:
  files that live on the machine, not in a browser profile
- **Provider calls from the kernel** once it has a network stack, with the
  key held as a capability that expires, which is what the kernel is for
- **The kernel's seal on the desktop's attestation**: the desktop's root
  sealed by the kernel's epoch key over the bridge, so an attestation is a
  proof rather than a claim

### 2. Agents that do more than answer

- **Scheduled agents**: run this at 9, with these leases, and put the result
  in this file. The lease model already expresses "until 9:15".
- **Agents talking to agents** through the ledger: one process leaves a note
  another picks up, with the cause chain intact across both
- **A skills directory** under `/home/agents`: SHE or Markdown files an agent
  can be pointed at, granted like anything else

### 3. The desktop, past the first mile

- **Search across files** with an embedding provider, behind the same key
  system; the current `find` is substring
- **Rich files**: images and PDFs in the filesystem, viewed not just stored;
  the store's in-memory ceiling has to move first
- **Window layouts** that survive a reload
- **Themes** beyond light and dark, keeping the clock-keyed accent

### 4. Hardening

- **A content security policy** on the deployed desktop that names the
  provider hosts and nothing else
- **Per-tool leases** as well as per-scope, for people who want to grant
  `fs_read` on one directory
- **A fuzz of `md()`** with model output, since that is the one place
  untrusted text becomes HTML

---

## Wanted, unclaimed

Good entry points for a first contribution. None of these need the whole tree
in your head.

| Task | Where | Size |
|---|---|---|
| A provider that speaks a fourth wire format (Cohere, for one) | `providers.js`, `tests/providers.test.js` | small |
| Rename in the Files app, and `mv` for directories in the shell | `apps.js`, `shell.js` | small |
| A `find` that also searches the ledger | `shell.js` | small |
| Keyboard navigation of the Files list | `apps.js` | small |
| An aarch64 job in CI that boots through the bridge | `.github/workflows/ci.yml` | small |
| A bridge that accepts more than one viewer, read-only for all but one | `bridge.py` | medium |
| The desktop as a single HTML file, for a `file://` double-click | `tools/` | medium |

---

## Explicitly not planned

Saying no is part of a roadmap.

- **A RESENTMENT server.** No accounts, no hosted keys, no relay. The whole
  point is that your key and your files are in your browser and your kernel.
  A feature that needs a server is a different project.
- **A framework or a bundler.** The desktop is static files a person can read.
  That is a security property as much as a taste.
- **Permissions without deadlines.** There will not be an "always allow"
  button. If a fifteen-minute lease is annoying, the setting goes to eight
  hours; it does not go to forever.
- **A model the OS depends on.** The desktop works with no provider configured.
  An operating system may consult a model. It may never require one.
- **Telemetry**, including the "anonymous" kind.
- **Kernel patches carried here.** The kernel is upstream. The submodule
  pointer is the whole of the dependency.
