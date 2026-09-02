#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""The bridge between the desktop and the kernel.

The RESENTMENT kernel has a serial console and, for now, no network stack.
The desktop runs in a browser. This process sits between them: it boots the
kernel under QEMU with its serial port on a local TCP socket, serves the
desktop's static files over HTTP, and relays the serial byte stream over a
WebSocket at /serial. Standard library only, so `make run` needs nothing
installed beyond Python and QEMU.

    python os/bridge/bridge.py                 # x86_64, port 7411, opens nothing
    python os/bridge/bridge.py --arch aarch64
    python os/bridge/bridge.py --no-qemu       # serve the desktop, wait for a
                                               # serial peer on --serial-port
    python os/bridge/bridge.py --open          # and open the browser

One browser at a time may hold the serial line; a second gets 409. Every
byte the kernel has printed is kept (last 64 KiB) and replayed to a client
that attaches late, so the boot log is never missed.

ponytail: one serial peer, one WebSocket client, no TLS. It is a local
development bridge; put it behind a reverse proxy if it ever needs to be
more.
"""
import argparse
import base64
import hashlib
import http.server
import os
import socket
import struct
import subprocess
import sys
import threading
import time
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESKTOP = os.path.join(ROOT, "os", "desktop")
KERNEL = os.path.join(ROOT, "kernel")

# Mirrors tools/qemu-expect.py in the kernel: how each architecture boots.
TARGETS = {
    "x86_64":  {"qemu": "qemu-system-x86_64",  "kernel": "dist/x86_64/resentment32.elf",
                "args": ["-m", "512M", "-no-reboot"], "initrd": "dist/x86_64/initrd.tar"},
    "aarch64": {"qemu": "qemu-system-aarch64", "kernel": "dist/aarch64/resentment.elf",
                "args": ["-M", "virt", "-cpu", "cortex-a72", "-m", "512M", "-no-reboot"], "initrd": None},
    "riscv64": {"qemu": "qemu-system-riscv64", "kernel": "dist/riscv64/resentment.elf",
                "args": ["-M", "virt", "-m", "512M", "-no-reboot"], "initrd": None},
}

WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class Serial:
    """The kernel end: whoever connects to the serial listener."""

    def __init__(self, port):
        self.port = port
        self.sock = None
        self.log = b""
        self.lock = threading.Lock()
        self.client = None          # the one WebSocket that may read and write
        self.listener = socket.socket()
        self.listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.listener.bind(("127.0.0.1", port))
        self.listener.listen(1)
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while True:
            sock, _ = self.listener.accept()
            with self.lock:
                self.sock = sock
            print(f"  serial: kernel connected on 127.0.0.1:{self.port}")
            try:
                while True:
                    chunk = sock.recv(4096)
                    if not chunk:
                        break
                    with self.lock:
                        self.log = (self.log + chunk)[-65536:]
                        client = self.client
                    if client:
                        try:
                            client.send(chunk)
                        except OSError:
                            pass
            finally:
                with self.lock:
                    self.sock = None
                print("  serial: kernel disconnected")

    def write(self, data):
        with self.lock:
            sock = self.sock
        if sock:
            sock.sendall(data)

    def attach(self, ws):
        """Reserve the line. Returns the backlog to replay once the
        handshake is done, or None if someone else holds it."""
        with self.lock:
            if self.client is not None:
                return None
            self.client = ws
            return self.log

    def detach(self, ws):
        with self.lock:
            if self.client is ws:
                self.client = None


class WebSocket:
    """Just enough of RFC 6455: the handshake, masked client frames in,
    unmasked binary frames out, ping/pong and close."""

    def __init__(self, sock):
        self.sock = sock
        self.wlock = threading.Lock()

    @staticmethod
    def accept_key(key):
        return base64.b64encode(hashlib.sha1(key.encode() + WS_GUID).digest()).decode()

    def send(self, data, opcode=0x2):
        n = len(data)
        head = bytes([0x80 | opcode])
        if n < 126:
            head += bytes([n])
        elif n < 65536:
            head += bytes([126]) + struct.pack(">H", n)
        else:
            head += bytes([127]) + struct.pack(">Q", n)
        with self.wlock:
            self.sock.sendall(head + data)

    def _read(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("closed")
            buf += chunk
        return buf

    def recv(self):
        """Returns (opcode, payload), or (8, b'') on close."""
        b0, b1 = self._read(2)
        opcode = b0 & 0x0F
        masked = b1 & 0x80
        n = b1 & 0x7F
        if n == 126:
            n = struct.unpack(">H", self._read(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", self._read(8))[0]
        mask = self._read(4) if masked else None
        data = self._read(n)
        if mask:
            data = bytes(c ^ mask[i % 4] for i, c in enumerate(data))
        return opcode, data


class Handler(http.server.SimpleHTTPRequestHandler):
    serial = None

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DESKTOP, **kw)

    def log_message(self, fmt, *args):
        if "/serial" in fmt % args or self.path == "/serial":
            print("  " + (fmt % args))

    def end_headers(self):
        # The desktop may be served from anywhere (GitHub Pages included) and
        # still attach to a bridge on localhost.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path != "/serial":
            return super().do_GET()
        key = self.headers.get("Sec-WebSocket-Key")
        if self.headers.get("Upgrade", "").lower() != "websocket" or not key:
            self.send_error(400, "expected a WebSocket upgrade")
            return
        ws = WebSocket(self.connection)
        backlog = Handler.serial.attach(ws)
        if backlog is None:
            self.send_error(409, "another client holds the serial line")
            return
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", WebSocket.accept_key(key))
        self.end_headers()
        self.wfile.flush()
        self.close_connection = True
        print("  serial: desktop attached")
        try:
            if backlog:
                ws.send(backlog)
            while True:
                opcode, data = ws.recv()
                if opcode == 0x8:
                    break
                if opcode == 0x9:
                    ws.send(data, 0xA)
                elif opcode in (0x1, 0x2):
                    Handler.serial.write(data)
        except (ConnectionError, OSError):
            pass
        finally:
            Handler.serial.detach(ws)
            print("  serial: desktop detached")


def start_qemu(arch, qemu, serial_port):
    spec = TARGETS[arch]
    kernel = os.path.join(KERNEL, spec["kernel"])
    if not os.path.exists(kernel):
        sys.exit(f"{kernel} does not exist; run `make kernel ARCH={arch}` first")
    cmd = [qemu or spec["qemu"], "-kernel", kernel, "-display", "none"] + spec["args"]
    cmd += ["-serial", f"tcp:127.0.0.1:{serial_port}"]
    initrd = spec["initrd"] and os.path.join(KERNEL, spec["initrd"])
    if initrd and os.path.exists(initrd):
        cmd += ["-initrd", initrd]
    print("  qemu: " + " ".join(cmd))
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--arch", default="x86_64", choices=list(TARGETS))
    ap.add_argument("--port", type=int, default=7411, help="HTTP and WebSocket port")
    ap.add_argument("--serial-port", type=int, default=45150, help="where QEMU's serial connects")
    ap.add_argument("--qemu", default=None, help="path to the QEMU binary")
    ap.add_argument("--no-qemu", action="store_true", help="do not start QEMU; wait for any serial peer")
    ap.add_argument("--open", action="store_true", help="open the desktop in the browser")
    args = ap.parse_args()

    Handler.serial = Serial(args.serial_port)
    qemu = None if args.no_qemu else start_qemu(args.arch, args.qemu, args.serial_port)

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"  RESENTMENT OS desktop on {url}  (serial at ws://127.0.0.1:{args.port}/serial)")
    if args.open:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if qemu:
            qemu.terminate()
            try:
                qemu.wait(timeout=5)
            except subprocess.TimeoutExpired:
                qemu.kill()


if __name__ == "__main__":
    main()
