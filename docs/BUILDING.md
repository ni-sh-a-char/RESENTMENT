# Building

## The desktop alone

Nothing to build. Serve `os/desktop/` with any static server, or:

```sh
make desktop        # serves it on http://127.0.0.1:7411/ and opens the browser
```

It also runs from the deployed copy at <https://ni-sh-a-char.github.io/RESENTMENT/os/>.

## The kernel, and the whole thing

```sh
git clone --recursive -b v2.0.0 https://github.com/ni-sh-a-char/RESENTMENT.git
cd RESENTMENT
make toolchain      # once: fetches a portable zig and nasm into kernel/.toolchain/
make                # build the kernel for x86_64 with the OS ramdisk
make run            # boot under QEMU, serve the desktop, open the browser
```

You need `make`, `python3`, `git`, and `qemu-system-x86_64` (or the aarch64
or riscv64 one). The toolchain step fetches the compilers; nothing is
installed system-wide.

If you have a cross gcc instead, the kernel accepts `TOOLCHAIN=gcc`:

```sh
make TOOLCHAIN=gcc kernel
```

Other architectures:

```sh
make ARCH=aarch64 run
make ARCH=riscv64 run
```

## Tests

```sh
make test           # desktop under node --test; bridge against a fake kernel
make qemu-test      # boot the real kernel and drive it through the bridge
make kernel-test    # the kernel's own host suite, with our ramdisk
make check          # test + kernel-test
```

`make test` needs Node 22 or newer and Python 3.10 or newer, nothing else.
`make qemu-test` needs a built kernel and QEMU.

## What CI does

On every push to `v2.0.0`: the desktop tests, the bridge test, then a job
that checks out the submodule, installs gcc, nasm and QEMU, builds the kernel
with the OS ramdisk, runs the kernel's host suite, boots the kernel and
drives it through the bridge with the OS's own SHE program, and uploads the
kernel image and ramdisk as artifacts. When all of that is green it asks the
`main` branch to republish the website, which renders these docs and ships
the desktop.

## Windows

The kernel's Makefile and `make toolchain` work under Git Bash or MSYS2. The
bridge and the tests are plain Python and Node. `make` from GnuWin32 is old
but sufficient. QEMU for Windows works with `--qemu "C:/Program Files/qemu/qemu-system-x86_64.exe"`.
