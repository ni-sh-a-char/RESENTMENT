<p align="center">
  <img src="https://raw.githubusercontent.com/ni-sh-a-char/RESENTMENT/main/web/social-preview.png" alt="RESENTMENT OS 2.0.0 — an AI operating system on its own kernel and your own key" width="100%">
</p>

<p align="center">
  <a href="https://github.com/ni-sh-a-char/RESENTMENT/actions/workflows/ci.yml"><img src="https://github.com/ni-sh-a-char/RESENTMENT/actions/workflows/ci.yml/badge.svg?branch=v2.0.0" alt="CI"></a>
  <a href="https://github.com/ni-sh-a-char/RESENTMENT/blob/v2.0.0/LICENSE"><img src="https://img.shields.io/badge/licence-Apache--2.0-1c212b?style=flat-square&labelColor=08090c" alt="Apache 2.0"></a>
  <a href="https://ni-sh-a-char.github.io/RESENTMENT/os/"><img src="https://img.shields.io/badge/try%20it-in%20the%20browser-e0a545?style=flat-square&labelColor=08090c" alt="Try it in the browser"></a>
  <a href="https://github.com/ni-sh-a-char/RESENTMENT---kernel"><img src="https://img.shields.io/badge/kernel-x86__64%20%7C%20aarch64%20%7C%20riscv64-4fd6d2?style=flat-square&labelColor=08090c" alt="kernel: x86_64, aarch64, riscv64"></a>
  <a href="https://buymeacoffee.com/piyushmishra00"><img src="https://img.shields.io/badge/buy%20me%20a%20coffee-e0a545?style=flat-square&logo=buymeacoffee&logoColor=08090c&labelColor=08090c" alt="Buy me a coffee"></a>
</p>

---

# RESENTMENT OS

**An AI operating system on its own kernel and your own key.**

Open it. Paste a key from any model provider. Ask for something. Watch the
agent stop at the first permission it does not have, grant it for fifteen
minutes, and watch the whole system's hash change when it writes a file.

**Try it now:** <https://ni-sh-a-char.github.io/RESENTMENT/os/> — nothing is
installed, nothing leaves your browser except the request to the provider you
chose.

```sh
git clone --recursive -b v2.0.0 https://github.com/ni-sh-a-char/RESENTMENT.git
cd RESENTMENT
make toolchain      # once: a portable zig and nasm, no installer
make run            # build the kernel, boot it under QEMU, open the desktop
```

---

## What makes it different

Most "AI operating systems" are a chat window with file access. This one is
built on a kernel whose three ideas the desktop repeats at its own level, so
the same rules hold from the boot sector to the chat box.

| Idea | In the kernel | On the desktop |
|---|---|---|
| **Authority expires** | every capability carries a Kaalka seal with a time window; a forgotten permission stops working on its own | every permission an agent holds is a *lease* with a deadline; there is no "allow forever" button |
| **The system is a hash** | every kernel object is a node in a Merkle DAG; the machine has one SHA-256 root | every file and setting is a node; the OS has one root you can snapshot, diff and attest. Keys are never in it |
| **Agents are processes** | inference is a scheduling class with admission control and a budget | every agent has a state, a token budget, a place in the process table, and a kill button |
| **Nothing is forgotten** | events are recorded in causal order for deterministic replay | every tool call is a ledger entry; every file change names the call that caused it; undo is a new entry, not a deletion |

And the parts a desktop needs anyway: windows, a dock, files, an editor, a
terminal, settings, a command bar on <kbd>Ctrl</kbd> <kbd>K</kbd> that opens
apps, runs commands or asks the model, offline as an installable app, light
and dark, and an accent colour keyed from the clock the way the kernel keys
its authority from the clock.

### Bring your own key, from anyone

| Provider | How it is reached |
|---|---|
| Anthropic | the Messages API, directly from the browser |
| OpenAI, Groq, Mistral, xAI, DeepSeek, OpenRouter, Together | `/chat/completions` |
| Google Gemini | `generateContent` |
| Ollama, LM Studio, vLLM, llama.cpp, anything OpenAI-compatible | `/chat/completions` on the address you give it |

Keys stay in this browser. Optionally sealed under a passphrase with AES-GCM.
Never exported, never in the digest, never sent anywhere but the provider's own
endpoint. There is no RESENTMENT server.

### The real kernel, on the desk

The [RESENTMENT kernel](https://github.com/ni-sh-a-char/RESENTMENT---kernel) is
a from-scratch, capability-secure, AI-native kernel for x86_64, ARM64 and
RISC-V, with a transformer forward pass running on its own operators, a SHE
shell, and a Merkle root for the whole machine. It has a serial console and no
network stack yet, so the desktop reaches it through a small bridge that
relays the serial port over a WebSocket. Attach, and:

- the **Kernel** window is a live console into ring 0
- the **Digest** window shows the kernel's root beside the desktop's own
- the agent gets a `kernel_eval` tool and can run SHE on the machine, subject
  to the kernel's own `.allow` grants, which are as strict as the desktop's

The OS's own programs, in [`os/user/`](os/user/), are built into the kernel's
initial ramdisk.

---

## Layout

```
kernel/          the RESENTMENT kernel, a git submodule pinned to its v2.0.0
os/
  desktop/       the desktop: static HTML, CSS and ES modules, no build step
    js/core.js       filesystem, digest, leases, ledger, vault - no DOM
    js/providers.js  Anthropic, OpenAI-compatible and Gemini adapters
    js/agent.js      agents as processes: tools, scopes, budgets
    js/shell.js      the terminal's command language
    js/kernel.js     the serial protocol to the kernel
    js/wm.js         windows
    js/apps.js       the ten built-in apps
    js/main.js       boot, top bar, dock, intent bar, lease dialog
  bridge/        bridge.py: QEMU + serial over WebSocket + static files, stdlib only
  user/          SHE programs added to the kernel's ramdisk
tests/           node --test for the desktop; a stdlib Python test for the bridge
docs/            how it fits together, and why
```

## Status

| Part | State |
|---|---|
| Desktop: windows, dock, intent bar, ten apps, offline | **working**, deployed at the link above |
| Providers: Anthropic, OpenAI-compatible, Gemini, streaming, tool calls | **working**, request shaping and stream parsing tested |
| Leases, ledger with undo, digest with snapshot/diff/attest | **working**, tested |
| Vault: plain or AES-GCM under a passphrase | **working**, tested |
| Bridge: QEMU serial over WebSocket | **working**, tested against a fake kernel and against QEMU in CI |
| Kernel: boots with the OS ramdisk, answers the desktop over the bridge | **working on x86_64 in CI**; aarch64 and riscv64 build, bridge attaches the same way |
| The desktop *running inside* the kernel | **not yet** - the kernel needs a network stack and a framebuffer compositor first; both are on its [roadmap](https://github.com/ni-sh-a-char/RESENTMENT---kernel/blob/main/ROADMAP.md) |

Honest, because a status table that overstates is worse than none. Today the
desktop runs in a browser on a host and drives the kernel; the direction is
for the desktop to run on the kernel, and every design choice here (no
server, no build step, no ambient authority, one hash) is made so that move
is a port and not a rewrite.

## Verification

| Command | What it proves |
|---|---|
| `make test` | 26 desktop checks under Node plus the bridge against a fake kernel |
| `make qemu-test` | the real kernel boots with the OS ramdisk and answers through the bridge |
| `make kernel-test` | the kernel's own 1440 host assertions, with our ramdisk |
| `make check` | the first and the third |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — the layers and why they are cut where they are
- [The desktop](docs/DESKTOP.md) — apps, the intent bar, keyboard
- [Providers](docs/PROVIDERS.md) — every provider, and the CORS notes for local ones
- [Agents](docs/AGENTS.md) — tools, scopes, leases, budgets, the ledger
- [The digest](docs/DIGEST.md) — what is hashed, what is not, snapshots and attestation
- [The kernel](docs/KERNEL.md) — the bridge, the serial protocol, the ramdisk programs
- [Building](docs/BUILDING.md) — toolchains, QEMU, the tests
- [Contributing](https://github.com/ni-sh-a-char/RESENTMENT/blob/main/CONTRIBUTING.md) · [Roadmap](https://github.com/ni-sh-a-char/RESENTMENT/blob/main/ROADMAP.md) · [Security](https://github.com/ni-sh-a-char/RESENTMENT/blob/main/SECURITY.md) · [Governance](https://github.com/ni-sh-a-char/RESENTMENT/blob/main/GOVERNANCE.md)

The website, with everything above rendered for reading: **<https://ni-sh-a-char.github.io/RESENTMENT/>**.

## History

RESENTMENT began as a Linux distribution: an LFS-style build environment and
`spkm`, a small package manager in C. That is `v1.0.0`, kept as a branch and a
tag because the starting point is part of the story. `v2.0.0` is this tree,
an operating system on its own kernel.

| Branch | What it holds |
|---|---|
| `main` | the website and the community files. Releases are tagged from the version branches. |
| `v2.0.0` | the operating system: the kernel submodule, the desktop, the bridge, the tests, the docs |
| `v1.0.0` | the Linux distribution, frozen at the `v1.0.0` tag |

A branch and a tag share a name here, which git allows but treats as
ambiguous: say `git checkout refs/heads/v2.0.0` for the branch or
`refs/tags/v2.0.0` for the tag when it matters.

## Support

RESENTMENT is built in the open and will stay that way. If it is useful to you,
you can [buy me a coffee](https://buymeacoffee.com/piyushmishra00).

## Licence

Apache 2.0. See [LICENSE](https://github.com/ni-sh-a-char/RESENTMENT/blob/v2.0.0/LICENSE).
The kernel is Apache 2.0 too.
