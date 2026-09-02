# Changelog

All notable changes to this project are recorded here. This project follows
[semantic versioning](https://semver.org/).

## Unreleased

- **Local models inside the browser.** A new provider, *In your browser
  (WebGPU, no server)*, runs Llama 3, Hermes 3, Qwen 3, Phi 4 mini, Gemma 2
  and the rest of the WebLLM catalogue on your own GPU, in a web worker,
  with no key and nothing leaving the machine. Weights download once and
  cache; progress shows in the chat's status line. Tool calling is offered
  to the models that support it and withheld from the ones that do not.
  This is the one runtime the desktop loads from a CDN, pinned, and only
  when chosen.

## 2.0.0 — "prahar"

RESENTMENT becomes an operating system on its own kernel. Version 1.0.0 was a
Linux distribution and a package manager. This one is a desktop that runs in
any browser, takes a key from any model provider, and drives the RESENTMENT
kernel over a serial bridge.

A *prahar* is a division of the day, about three hours, the unit Indian
classical music uses to say when a raga belongs. The kernel is "kaalachakra",
the wheel of time; the OS is one turn of it.

### The desktop

- **Windows, a dock, a top bar**, an intent bar on Ctrl+K that opens apps,
  runs commands or asks the model. Light and dark. Installable and offline.
- **Ten apps**: Ask, Files, Editor, Terminal, Settings, Agents, Ledger,
  Digest, Kernel, About.
- **A virtual filesystem** in the browser, with import and export.
- **An accent colour keyed from the clock**, the way the kernel keys its
  authority from the clock.

### Any provider

- **Anthropic** over the Messages API with streaming and tool use, directly
  from the browser.
- **Every OpenAI-compatible endpoint**: OpenAI, Groq, Mistral, xAI, DeepSeek,
  OpenRouter, Together, Ollama, LM Studio, vLLM, llama.cpp, or a URL of your
  own.
- **Google Gemini** over `generateContent`.
- One internal message shape, one stream event shape, tested against recorded
  events from all three wire formats.

### The four ideas, at desktop level

- **Leases.** Every permission an agent holds has a deadline. Scopes are
  `fs.read`, `fs.write`, `shell`, `kernel`, `web`, `os`. The first use of a
  scope pauses the agent until the user grants a lease.
- **The digest.** SHA-256 over every file and setting, timestamps and keys
  excluded, so two machines with the same content agree on the number.
  Snapshots, diffs, and an exportable attestation.
- **Agents as processes.** State, token budget, calls, uptime; pause, resume,
  kill. Killing an agent revokes its leases.
- **The ledger.** Every tool call, every file change with its cause, every
  denial. Undo restores files and is itself an entry.

### The kernel

- The **RESENTMENT kernel 2.0.0** as a git submodule, pinned to its `v2.0.0`
  branch.
- **`os/user/`**: SHE programs added to the kernel's initial ramdisk.
- **The bridge**: QEMU with its serial port on a local socket, relayed over
  a WebSocket, plus the desktop's static files, in one standard-library
  Python process.
- **The serial protocol**, in the desktop: type a line, wait for the prompt,
  strip the echo, one command at a time.
- CI boots the real kernel with the OS ramdisk and drives it through the
  bridge on every push.

## 1.0.0

A Linux distribution: an LFS-style build environment under `build_env/`, a
package repository under `repo/`, and `spkm`, a package manager in C that reads
YAML package descriptions. Frozen on the `v1.0.0` branch.
