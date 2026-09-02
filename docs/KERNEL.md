# The kernel

RESENTMENT OS runs on the [RESENTMENT kernel](https://github.com/ni-sh-a-char/RESENTMENT---kernel),
a from-scratch kernel for x86_64, ARM64 and RISC-V that is not a Unix clone.
Its own documentation is the reference; this page is what the OS needs from
it and how the two meet.

## What it is, in a paragraph

Every capability in the kernel carries a cryptographic seal with a time
window, so authority expires by construction. Every kernel object is a node
in a Merkle DAG and the machine has one SHA-256 root, so system state can be
diffed, attested and replayed. Inference is a scheduling class: models,
tensors and attention caches are kernel objects, and a transformer forward
pass runs on the kernel's own operators. The shell is a SHE interpreter, and
a program starts with no permissions. Three architectures, SMP, 1440 host
assertions, six QEMU targets, seven self-tests on every boot.

## How the OS uses it

The kernel is a git submodule at `kernel/`, pinned to the kernel's `v2.0.0`
branch, which carries the kernel alone with no site and no community files.

```sh
git submodule update --init      # if you cloned without --recursive
make kernel                      # builds it, with os/user/ in the ramdisk
```

`make kernel` runs the kernel's own Makefile with `USER_EXTRA=os/user`, which
the kernel copies into the initial ramdisk beside its own `user/`.

## The bridge

The kernel has a serial console. QEMU can put that on a TCP socket. The
bridge (`os/bridge/bridge.py`) listens for it, serves the desktop, and relays
the byte stream over a WebSocket at `/serial`.

```
make run                          # x86_64, port 7411, opens the browser
make ARCH=aarch64 run
python os/bridge/bridge.py --help
```

Then, in the desktop, open **Kernel** and press **Attach**. The boot log
appears (the bridge replays what it has), then the prompt.

## The serial protocol

In `os/desktop/js/kernel.js`. A serial line is one stream with no framing, so
the protocol is the shell's own:

1. type a line and a carriage return
2. read until the prompt (`resentment> ` or the continuation `        ... `)
3. drop the echo of the typed line
4. what is left is the reply

One command at a time, in order. A timeout rejects that command and the link
continues. ANSI colour sequences are stripped. Any 64-character hex word that
goes by is remembered as the kernel's latest digest for the top bar.

The agent's `kernel_eval` tool is exactly this. It is gated by the `kernel`
scope on the desktop side and, once the line reaches the kernel, by the
kernel's own grants: a script that calls `read()` without `.allow read` is
refused there, and the refusal names the flag.

## The OS's ramdisk programs

`os/user/bin/facts.she` prints the machine as `key=value` lines; the desktop
does not need a parser for that. `os/user/bin/pulse.she` seals the current
digest for sixty seconds. Both start with no permissions:

```
resentment> .run /boot/bin/facts.she
not allowed to system.
  This script was not granted permission to read the runtime graph.
  Run it with --allow-graph to permit it.
resentment> .allow all
resentment> .run /boot/bin/facts.she
arch=x86_64
cpus=4
memory_free=529924096
digest=7d4a1f0e…
angles=142.5,87.0,55.5
boots=3
```

## What the kernel does not have yet, and why it matters here

No network stack, no block device, no framebuffer compositor. That is why the
desktop is a web page on a host for now. The kernel's roadmap puts PCI,
virtio-net and a block layer next; when they land, the desktop's provider
layer (which is `fetch` and nothing else) and its filesystem (which is a map)
have obvious kernel-side homes.

## Contributing to the kernel

Kernel changes go to the [kernel repository](https://github.com/ni-sh-a-char/RESENTMENT---kernel).
This repository bumps the submodule when a kernel release it wants to depend
on is tagged. Do not vendor patches here; the submodule pointer is the whole
of the dependency.
