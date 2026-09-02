# SPDX-License-Identifier: Apache-2.0
# RESENTMENT OS - build system.
#
#   make toolchain        once: fetch zig and nasm into the kernel, no installer
#   make                  build the kernel with the OS's programs in its ramdisk
#   make run              boot it under QEMU, serve the desktop, open the browser
#   make desktop          serve the desktop alone, no kernel
#   make test             the desktop and the bridge, under Node and Python
#   make qemu-test        boot the real kernel and drive it through the bridge
#   make check            everything above plus the kernel's own host suite
#   make ARCH=aarch64     any of the above for another architecture
#
# The kernel is a git submodule at kernel/, built by its own Makefile. This
# one only tells it where the OS's SHE programs are, so they land in the
# initial ramdisk beside the kernel's own.

ARCH       ?= x86_64
KERNEL     := kernel
USER_EXTRA := $(abspath os/user)

# Probe by running it: Windows ships a `python3` shim that exists and fails.
PYTHON ?= $(shell if python3 -c "" >/dev/null 2>&1; then echo python3; else echo python; fi)

KFLAGS := ARCH=$(ARCH) USER_EXTRA=$(USER_EXTRA) $(if $(TOOLCHAIN),TOOLCHAIN=$(TOOLCHAIN),)

.PHONY: all kernel run desktop test test-desktop test-bridge kernel-test qemu-test check toolchain clean submodule help
.DEFAULT_GOAL := all

all: kernel

submodule:
	@test -f $(KERNEL)/Makefile || { \
	  echo "kernel/ is empty. The kernel is a submodule:"; \
	  echo "    git submodule update --init"; exit 1; }

kernel: submodule
	"$(MAKE)" -C $(KERNEL) $(KFLAGS) kernel

run: kernel
	$(PYTHON) os/bridge/bridge.py --arch $(ARCH) --open

desktop:
	$(PYTHON) os/bridge/bridge.py --no-qemu --open

test: test-desktop test-bridge

test-desktop:
	node --test "tests/*.test.js"

test-bridge:
	$(PYTHON) tests/test_bridge.py

kernel-test: submodule
	"$(MAKE)" -C $(KERNEL) $(KFLAGS) test

qemu-test: kernel
	$(PYTHON) tests/test_bridge.py --real

check: test kernel-test

toolchain: submodule
	"$(MAKE)" -C $(KERNEL) toolchain

clean: submodule
	"$(MAKE)" -C $(KERNEL) clean

help:
	@sed -n '2,15p' Makefile | sed 's/^# \{0,1\}//'
