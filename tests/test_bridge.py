#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""The bridge, end to end, with nothing but the standard library.

Default mode fakes the kernel: a TCP peer plays resh, printing a boot log and
a prompt and echoing what it is sent. The test attaches a WebSocket client,
checks the backlog arrives, types a command, and checks the reply relays.

    python tests/test_bridge.py            # against the fake kernel
    python tests/test_bridge.py --real     # against QEMU and the built kernel

--real is what CI runs after building the kernel: it proves the desktop's
serial protocol against the actual shell, including the OS's own SHE program
in the initrd.
"""
import base64
import os
import socket
import struct
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "os", "bridge", "bridge.py")
PORT, SERIAL = 7499, 45199


def ws_connect(port, path="/serial"):
    s = socket.create_connection(("127.0.0.1", port), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((f"GET {path} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
    head = b""
    while b"\r\n\r\n" not in head:
        head += s.recv(1)
    status = head.split(b"\r\n")[0]
    return s, status


def ws_send(s, data):
    mask = os.urandom(4)
    head = bytes([0x82, 0x80 | len(data)]) if len(data) < 126 else bytes([0x82, 0x80 | 126]) + struct.pack(">H", len(data))
    s.sendall(head + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(data)))


def ws_recv(s):
    b0, b1 = s.recv(2)
    n = b1 & 0x7F
    if n == 126:
        n = struct.unpack(">H", s.recv(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", s.recv(8))[0]
    data = b""
    while len(data) < n:
        data += s.recv(n - len(data))
    return b0 & 0x0F, data


def ws_read_until(s, needle, timeout=30):
    buf = b""
    s.settimeout(timeout)
    deadline = time.time() + timeout
    while needle not in buf and time.time() < deadline:
        _, data = ws_recv(s)
        buf += data
    return buf


def fake_kernel():
    """Connect to the bridge's serial listener and behave like resh."""
    s = socket.create_connection(("127.0.0.1", SERIAL))
    s.sendall(b"[    0.001] boot     boot complete in 3 ms\r\n\x1b[32mresentment> \x1b[0m")
    buf = b""
    while True:
        chunk = s.recv(1024)
        if not chunk:
            return
        buf += chunk
        while b"\r" in buf:
            line, buf = buf.split(b"\r", 1)
            reply = {b"2 + 2": b"4", b".digest": b"7d4a1f0e83c25b9a6f1e0d4c8b3a7e2f5d9c1b8a4e7f0c3d6a9b2e5f8c1d4a7b"}.get(line.strip(), b"?")
            s.sendall(line + b"\r\n" + reply + b"\r\nresentment> ")


def wait_port(port, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            socket.create_connection(("127.0.0.1", port), timeout=1).close()
            return True
        except OSError:
            time.sleep(0.1)
    return False


def main():
    real = "--real" in sys.argv
    cmd = [sys.executable, BRIDGE, "--port", str(PORT), "--serial-port", str(SERIAL)]
    if not real:
        cmd.append("--no-qemu")
    bridge = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    fails = 0
    try:
        assert wait_port(PORT), "bridge never listened"
        if not real:
            threading.Thread(target=fake_kernel, daemon=True).start()
            time.sleep(0.3)

        # The desktop's static files come from the same port.
        import urllib.request
        html = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/").read()
        assert b"RESENTMENT OS" in html, "index.html not served"
        print("  ok    desktop served")

        s, status = ws_connect(PORT)
        assert b"101" in status, status
        print("  ok    websocket upgrade")

        boot = ws_read_until(s, b"resentment>", 60 if real else 5)
        assert b"boot complete" in boot, boot[-400:]
        print("  ok    boot log replayed to a late client")

        # Only one client may hold the line.
        s2, status2 = ws_connect(PORT)
        assert b"409" in status2, status2
        s2.close()
        print("  ok    second client refused")

        ws_send(s, b"2 + 2\r")
        out = ws_read_until(s, b"resentment>")
        assert b"4" in out, out
        print("  ok    2 + 2 -> 4")

        ws_send(s, b".digest\r")
        out = ws_read_until(s, b"resentment>")
        assert any(len(w) == 64 and all(c in b"0123456789abcdef" for c in w) for w in out.split()), out
        print("  ok    .digest -> a 64-hex root")

        if real:
            ws_send(s, b".allow all\r")
            ws_read_until(s, b"resentment>")
            ws_send(s, b".run /boot/bin/facts.she\r")
            out = ws_read_until(s, b"resentment>", 60)
            assert b"arch=" in out and b"digest=" in out, out[-600:]
            print("  ok    the OS's own SHE program runs in the kernel's initrd")
            ws_send(s, b".poweroff\r")
            time.sleep(1)
        s.close()
    except AssertionError as e:
        fails += 1
        print("  FAIL ", e)
    finally:
        bridge.terminate()
        try:
            out = bridge.communicate(timeout=5)[0].decode(errors="replace")
        except subprocess.TimeoutExpired:
            bridge.kill()
            out = ""
        if fails:
            print("bridge output:\n" + out[-2000:])
    print("bridge: %s" % ("FAILED" if fails else "all checks passed"))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
