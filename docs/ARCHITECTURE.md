# Architecture

RESENTMENT OS is four layers. The cut between each is a real boundary: a
different process, a different machine, or a different privilege level.

```
┌────────────────────────────────────────────────────────────────────┐
│  Desktop        os/desktop     browser      windows, apps, agents  │
├────────────────────────────────────────────────────────────────────┤
│  Bridge         os/bridge      host         QEMU, serial ⇄ WebSocket│
├────────────────────────────────────────────────────────────────────┤
│  Ramdisk        os/user        kernel /boot SHE programs the OS adds│
├────────────────────────────────────────────────────────────────────┤
│  Kernel         kernel/        ring 0       RESENTMENT 2.0.0        │
└────────────────────────────────────────────────────────────────────┘
```

---

## The desktop

Static files: one HTML page, one stylesheet, nine ES modules. No framework,
no bundler, no server, and one dependency: the WebLLM runtime, loaded from a
CDN only when the user chooses to run a model inside the browser. It runs from GitHub Pages, from a
`file://` URL, from `python -m http.server`, or from the bridge.

The modules split by whether they touch the DOM:

| Module | DOM | What it is |
|---|---|---|
| `core.js` | no | the store, the filesystem, the digest, leases, the ledger, the vault, settings |
| `providers.js` | no | the provider catalogue; request builders and stream parsers for three wire formats |
| `agent.js` | no | tools, scopes, the agent loop, the process table |
| `shell.js` | no | the terminal's command language |
| `kernel.js` | no | the serial protocol to the kernel over a WebSocket |
| `wm.js` | yes | windows |
| `apps.js` | yes | the ten apps |
| `main.js` | yes | boot, the top bar, the dock, the intent bar, the lease dialog, the wallpaper |

Everything above the line runs under Node for the tests with fakes for
`fetch`, the WebSocket and the UI callbacks. Everything below the line is
looked at, not tested, because a test of a drag handler proves nothing a
screenshot does not.

### The `os` object

One object, built in `main.js`, is what every app and every agent sees:

```
os.fs        the filesystem            os.leases    who may do what, until when
os.ledger    what happened, and why    os.vault     the keys
os.settings  the settings              os.agents    the process table
os.kernel    the link to the kernel    os.shell     run a terminal line
os.digest    the current root          os.snapshot  take one
os.ui        open, notify, askLease    os.fetch     fetch, injectable
```

An app is not privileged over an agent. Anything an app does through `os`,
an agent can be granted. That is deliberate: the interesting property of the
permission system is what it refuses, and it should refuse the same things to
everyone.

### Persistence

The store is a map in memory written through to IndexedDB. The whole
filesystem is in memory. That is a ceiling of tens of megabytes and it is
fine for text; it is marked with a `ponytail:` comment in `core.js` naming
the upgrade. A private window, or a browser with storage blocked, still runs
the OS and forgets it on close.

---

## The bridge

The kernel has a serial console and no network stack. The desktop is a web
page. `os/bridge/bridge.py` is the shortest line between them:

1. listen on a local TCP port for the kernel's serial line
2. start QEMU with `-serial tcp:127.0.0.1:<port>` so it connects to that
3. serve `os/desktop/` over HTTP
4. on `GET /serial` with an upgrade header, speak WebSocket and relay bytes
   in both directions

It keeps the last 64 KiB the kernel printed and replays it to a client that
attaches late, so the boot log is never missed. One client may hold the line
at a time. It is standard library only, so `make run` needs Python and QEMU
and nothing else.

A page served from anywhere may attach to `ws://localhost:7411/serial`,
because browsers treat localhost as a secure context. The deployed desktop
can therefore drive a kernel booted on your laptop.

---

## The ramdisk

The kernel builds an initial ramdisk from its own `user/` directory. The OS's
Makefile passes `USER_EXTRA=os/user` and the kernel copies that in as well,
so `/boot/bin/facts.she` and `/boot/bin/pulse.she` sit beside the kernel's
`agent.she` and `attest.she`. They are ordinary SHE programs and start with no
permissions.

---

## The kernel

A git submodule at `kernel/`, pinned to the kernel's `v2.0.0` branch, which
carries the kernel alone. Its own `README.md` and `docs/` describe it; the
short version is on the [kernel page](KERNEL.md) here.

---

## Why the desktop is not inside the kernel yet

Because the kernel does not have what a desktop needs: a network stack to
reach a provider, a framebuffer compositor, input beyond a serial line and
PS/2. Those are on the kernel's roadmap in that order. Every choice in the
desktop is made so that when they land, moving in is a port and not a
rewrite:

- no server, so there is nothing to host
- no build step, so there is nothing to cross-compile
- no ambient authority, so the permission model already matches the kernel's
- one hash, computed the same way the kernel computes its own
- a shell whose commands are a function, not a UI
- a provider layer that is `fetch`, plus one in-browser inference runtime
