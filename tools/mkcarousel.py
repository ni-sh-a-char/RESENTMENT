#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Render the Instagram carousel for RESENTMENT OS.

Ten slides at 1080x1350, one idea per slide, the same palette and fonts as
the social card. Generated rather than drawn so the claims on the slides
are the claims in the tree. Writes the slides, the caption and the alt text.

    python tools/mkcarousel.py                       # into media/carousel/
    python tools/mkcarousel.py --out "some/folder"   # anywhere
    python tools/mkcarousel.py --fonts DIR           # fonts you already have
"""
import argparse
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mksocial as ms                                    # noqa: E402
from PIL import Image, ImageDraw                         # noqa: E402

ROOT = ms.ROOT
W, H = 1080, 1350
BG, FG, MUTED, FAINT = "#07080b", "#e6e9ef", "#9aa4b6", "#4a5364"
BRASS, CYAN, GREEN, RED, LINE = "#e0a545", "#4fd6d2", "#64d68a", "#ff6b6b", "#1c212b"
URL = "ni-sh-a-char.github.io/RESENTMENT"

CAPTION = """Give an AI a computer. Take it back at a time you choose.

RESENTMENT OS 2.0.0 "prahar" is an AI operating system built on its own kernel and your own key. It runs in your browser today and drives a real, from-scratch kernel over a serial bridge.

Four ideas, from ring 0 to the chat box:

1. Authority expires. Every permission an agent holds is a lease with a deadline. There is no "allow forever" button.
2. The system is a hash. One SHA-256 root over every file and setting. Snapshot it, diff it, attest it.
3. Agents are processes. State, token budget, a row in the process table, a kill button.
4. Nothing is forgotten. Every tool call is a ledger entry with a cause. Undo is a new entry, not a deletion.

Any provider: Anthropic, OpenAI, Gemini, Groq, Mistral, xAI, DeepSeek, OpenRouter, Together, Ollama, LM Studio, or any URL you own. Your key stays in your browser. No server. No telemetry. Apache 2.0.

Open it, no install: link in bio.
Built by @piyushmishra00 under ni_sh_a.char.

#opensource #operatingsystem #ai #llm #agents #kernel #riscv #arm64 #x86 #anthropic #openai #gemini #ollama #localfirst #privacy #buildinpublic #indiedev #programming #systemsprogramming #linux #developer #softwareengineering #github #resentmentos
"""


def wrap(dr, text, font, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if dr.textlength(t, font=font) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def block(dr, xy, text, font, fill, width, gap=1.18):
    x, y = xy
    for line in wrap(dr, text, font, width):
        dr.text((x, y), line, font=font, fill=fill)
        y += int(font.size * gap)
    return y


def base(F, n, total, eyebrow):
    img = Image.new("RGB", (W, H), BG)
    dr = ImageDraw.Draw(img, "RGBA")
    for x in range(0, W, 90):
        dr.line((x, 0, x, H), fill=(255, 255, 255, 6))
    for y in range(0, H, 90):
        dr.line((0, y, W, y), fill=(255, 255, 255, 6))
    # header
    dr.ellipse((72, 66, 96, 90), outline=(230, 233, 239, 90), width=2)
    dr.line((84, 78, 84, 69), fill=BRASS, width=3)
    dr.line((84, 78, 91, 82), fill=CYAN, width=3)
    dr.text((110, 64), "RESENTMENT OS", font=F("Inter-Bold.ttf", 22), fill=FG)
    dr.text((110 + dr.textlength("RESENTMENT OS ", font=F("Inter-Bold.ttf", 22)), 66), "2.0.0", font=F("JetBrainsMono-Regular.ttf", 18), fill=MUTED)
    dr.text((72, 108), eyebrow, font=F("JetBrainsMono-Regular.ttf", 20), fill=BRASS)
    # footer
    dr.line((72, H - 110, W - 72, H - 110), fill=LINE, width=1)
    dr.text((72, H - 90), URL, font=F("JetBrainsMono-Regular.ttf", 20), fill=CYAN)
    num = "%02d / %02d" % (n, total)
    f = F("JetBrainsMono-Regular.ttf", 20)
    dr.text((W - 72 - dr.textlength(num, font=f), H - 90), num, font=f, fill=FAINT)
    return img, dr


def arcs(dr, cx, cy, scale=1.0):
    n = datetime.datetime.now()
    s = n.second; m = n.minute + s / 60; h = (n.hour % 12) + m / 60
    for frac, r, col, w in ((1, 230, (255, 255, 255, 18), 2), (1, 180, (255, 255, 255, 18), 2), (1, 130, (255, 255, 255, 18), 2),
                            (h / 12, 130, (224, 165, 69, 230), 22), (m / 60, 180, (79, 214, 210, 200), 12), (s / 60, 230, (224, 165, 69, 140), 4)):
        r = int(r * scale); w = max(2, int(w * scale))
        dr.arc((cx - r, cy - r, cx + r, cy + r), -90, -90 + 360 * frac, fill=col, width=w)


def panel(dr, box, title=None, F=None):
    dr.rounded_rectangle(box, radius=18, fill="#0d0f14", outline=LINE, width=2)
    if title:
        dr.text((box[0] + 28, box[1] + 22), title, font=F("JetBrainsMono-Regular.ttf", 18), fill=FAINT)


def slides(F):
    out = []
    total = 10
    big = F("Inter-Bold.ttf", 84)
    mid = F("Inter-Bold.ttf", 60)
    body = F("Inter-Regular.ttf", 34)
    mono = F("JetBrainsMono-Regular.ttf", 26)
    small = F("JetBrainsMono-Regular.ttf", 22)

    # 1 cover
    img, dr = base(F, 1, total, "an AI operating system · on its own kernel · on your own key")
    arcs(dr, 800, 420, 1.0)
    y = 520
    for line, col in (("Give an AI", FG), ("a computer.", FG), ("Take it back", BRASS)):
        dr.text((72, y), line, font=big, fill=col); y += 96
    u = datetime.datetime.now() + datetime.timedelta(minutes=15)
    dr.text((72, y), "at %02d:%02d." % (u.hour, u.minute), font=big, fill=CYAN); y += 130
    block(dr, (72, y), "Ten slides on what an operating system looks like when authority expires, the whole machine is one hash, and the AI is a process you can kill.", body, MUTED, 936)
    dr.text((72, H - 170), "swipe  →", font=mono, fill=BRASS)
    out.append((img, "Cover. Give an AI a computer. Take it back at a time you choose. RESENTMENT OS 2.0.0, an AI operating system on its own kernel and your own key."))

    # 2 the problem
    img, dr = base(F, 2, total, "the problem")
    y = block(dr, (72, 200), "Most \"AI operating systems\" are a chat window with file access.", mid, FG, 936)
    y = block(dr, (72, y + 40), "The permission dialog says Allow. It means forever. Nobody can say what the machine looked like an hour ago, or which of the agent's forty actions changed the file.", body, MUTED, 936)
    y = block(dr, (72, y + 50), "RESENTMENT OS is built on a kernel whose ideas the desktop repeats at its own level, so the same rules hold in the boot sector and in the conversation.", body, FG, 936)
    out.append((img, "The problem: most AI operating systems are a chat window with file access. Allow means forever. RESENTMENT OS is built on a kernel whose ideas the desktop repeats."))

    # 3 leases
    img, dr = base(F, 3, total, "idea 1 of 4")
    dr.text((72, 190), "Authority", font=big, fill=FG); dr.text((72, 286), "expires.", font=big, fill=BRASS)
    cx, cy, r = 800, 300, 120
    dr.ellipse((cx - r, cy - r, cx + r, cy + r), outline=LINE, width=14)
    dr.arc((cx - r, cy - r, cx + r, cy + r), -90, 150, fill=BRASS, width=14)
    dr.text((cx - 56, cy - 26), "fs.write", font=F("JetBrainsMono-Regular.ttf", 24), fill=FG)
    dr.text((cx - 62, cy + 8), "14m 32s left", font=small, fill=MUTED)
    y = block(dr, (72, 440), "Every permission an agent holds is a lease with a deadline. Five minutes, an hour, a working day. There is no \"allow forever\" button, so a forgotten grant stops working by itself.", body, MUTED, 936)
    y = block(dr, (72, y + 40), "In the kernel it is the same idea one level down: every capability carries a Kaalka seal with a time window inside its MAC.", body, FG, 936)
    out.append((img, "Idea one: authority expires. Every permission an agent holds is a lease with a deadline, shown as a draining ring. In the kernel every capability carries a seal with a time window."))

    # 4 hash
    img, dr = base(F, 4, total, "idea 2 of 4")
    dr.text((72, 190), "The system", font=big, fill=FG); dr.text((72, 286), "is a hash.", font=big, fill=CYAN)
    panel(dr, (72, 420, 1008, 640), "this OS, right now", F)
    dr.text((100, 482), "7d4a1f0e83c25b9a6f1e0d4c8b3a7e2f", font=F("JetBrainsMono-Regular.ttf", 30), fill=CYAN)
    dr.text((100, 524), "5d9c1b8a4e7f0c3d6a9b2e5f8c1d4a7b", font=F("JetBrainsMono-Regular.ttf", 30), fill=CYAN)
    dr.text((100, 582), "sha-256 over every file and setting · no timestamps · no keys", font=small, fill=MUTED)
    y = block(dr, (72, 690), "One SHA-256 root for the whole OS. Snapshot it, change something, snapshot again, diff the two. Export an attestation. Two machines with the same content agree on the number.", body, MUTED, 936)
    y = block(dr, (72, y + 40), "The kernel does this for the machine: every kernel object is a node in a Merkle DAG with one root digest.", body, FG, 936)
    out.append((img, "Idea two: the system is a hash. One SHA-256 root over every file and setting, no timestamps, no keys. Snapshot, diff, attest. The kernel has one root for the whole machine."))

    # 5 processes
    img, dr = base(F, 5, total, "idea 3 of 4")
    dr.text((72, 190), "Agents are", font=big, fill=FG); dr.text((72, 286), "processes.", font=big, fill=BRASS)
    panel(dr, (72, 420, 1008, 690), "agents", F)
    rows = [("id", "state", "tokens / budget", "", FAINT), ("1", "running", "41 208 / 200 000", "kill", None), ("2", "waiting", "3 114 / 200 000", "kill", None), ("3", "idle", "128 990 / 200 000", "kill", None)]
    y = 478
    for i, (a, b, c, d, col) in enumerate(rows):
        f = small if i == 0 else F("JetBrainsMono-Regular.ttf", 24)
        dr.text((100, y), a, font=f, fill=col or MUTED)
        if i:
            dot = {"running": BRASS, "waiting": "#f0b64a", "idle": GREEN}[b]
            dr.ellipse((160, y + 9, 172, y + 21), fill=dot)
            dr.text((186, y), b, font=f, fill=FG)
        else:
            dr.text((160, y), b, font=f, fill=col)
        dr.text((460, y), c, font=f, fill=col or MUTED)
        dr.text((880, y), d, font=f, fill=RED if i else col)
        y += 52
    y = block(dr, (72, 740), "Every agent has a state, a token budget, a place in the process table and a kill button. Reaching the budget pauses it. Killing it revokes its leases.", body, MUTED, 936)
    block(dr, (72, y + 40), "In the kernel, inference is a scheduling class with admission control and a budget.", body, FG, 936)
    out.append((img, "Idea three: agents are processes. A process table with id, state, tokens against budget, and a kill button for each agent. In the kernel, inference is a scheduling class."))

    # 6 ledger
    img, dr = base(F, 6, total, "idea 4 of 4")
    dr.text((72, 190), "Nothing is", font=big, fill=FG); dr.text((72, 286), "forgotten.", font=big, fill=CYAN)
    panel(dr, (72, 420, 1008, 660), "ledger", F)
    rows = [("#41", "agent:2", "tool fs_write", "/home/documents/plan.md", ""), ("#42", "agent:2", "fs.write", "/home/documents/plan.md", "cause #41"), ("#43", "user", "undo", "to #40", "reversed 2")]
    y = 478
    for a, b, c, d, e in rows:
        f = F("JetBrainsMono-Regular.ttf", 22)
        dr.text((100, y), a, font=f, fill=FAINT); dr.text((160, y), b, font=f, fill=MUTED); dr.text((290, y), c, font=f, fill=BRASS); dr.text((500, y), d, font=f, fill=FG); dr.text((820, y), e, font=f, fill=CYAN)
        y += 48
    y = block(dr, (72, 710), "Every tool call is a ledger entry. Every file change names the call that caused it. Undo restores the files and is itself an entry. History is never deleted.", body, MUTED, 936)
    block(dr, (72, y + 40), "The kernel records events in causal order for deterministic replay. Same idea.", body, FG, 936)
    out.append((img, "Idea four: nothing is forgotten. A ledger where every tool call is an entry, every file change names its cause, and undo is a new entry. The kernel records events in causal order."))

    # 7 providers
    img, dr = base(F, 7, total, "bring your own key")
    dr.text((72, 190), "Any provider.", font=mid, fill=FG); dr.text((72, 262), "Your key.", font=mid, fill=BRASS); dr.text((72, 334), "No middleman.", font=mid, fill=FG)
    chips = ["Anthropic", "OpenAI", "Google Gemini", "Groq", "Mistral", "xAI", "DeepSeek", "OpenRouter", "Together", "Ollama", "LM Studio", "vLLM · llama.cpp · any URL"]
    x, y = 72, 450
    f = F("Inter-SemiBold.ttf", 26)
    for c in chips:
        tw = int(dr.textlength(c, font=f)) + 44
        if x + tw > W - 72:
            x = 72; y += 64
        local = c in ("Ollama", "LM Studio") or c.startswith("vLLM")
        dr.rounded_rectangle((x, y, x + tw, y + 50), radius=25, outline=FAINT if local else "#2a313f", width=2)
        dr.text((x + 22, y + 10), c, font=f, fill=MUTED if local else FG)
        x += tw + 12
    y = block(dr, (72, y + 100), "Three wire formats cover every model API anyone sells. Paste a key, pick a model, done. The key is stored in your browser, optionally sealed under a passphrase, and sent to exactly one place.", body, MUTED, 936)
    block(dr, (72, y + 36), "There is no RESENTMENT server. No telemetry. Nothing to sign up for.", body, FG, 936)
    out.append((img, "Any provider, your key, no middleman. Chips for Anthropic, OpenAI, Gemini, Groq, Mistral, xAI, DeepSeek, OpenRouter, Together, Ollama, LM Studio and any URL. No server, no telemetry."))

    # 8 kernel
    img, dr = base(F, 8, total, "the kernel is real")
    dr.text((72, 180), "Not a wrapper.", font=mid, fill=FG); dr.text((72, 252), "A kernel.", font=mid, fill=BRASS)
    panel(dr, (72, 350, 1008, 760), "make run · qemu-system-x86_64 · serial", F)
    lines = [("[    0.028901] cap      capability system ready: 24 types, sealed", MUTED), ("[    0.082106] smp      4 of 4 processors started", MUTED), ("[    0.118176] selftest all 7 self-tests passed", GREEN),
             ("", FG), ("resentment> .run /boot/bin/facts.she", CYAN), ("not allowed to system.", BRASS), ("resentment> .allow all", CYAN), ("resentment> .run /boot/bin/facts.she", CYAN), ("arch=x86_64  cpus=4", FG), ("digest=7d4a1f0e83c25b9a6f1e0d4c8b…", CYAN)]
    y = 410
    for t, col in lines:
        dr.text((100, y), t, font=F("JetBrainsMono-Regular.ttf", 21), fill=col); y += 31
    y = block(dr, (72, 800), "The RESENTMENT kernel is from scratch, for x86_64, ARM64 and RISC-V: capabilities that expire, one Merkle root for the machine, a transformer forward pass on its own operators. 1440 host assertions, six QEMU targets.", body, MUTED, 936)
    block(dr, (72, y + 30), "The desktop drives it over a serial bridge. The agent gets a kernel tool, gated by the kernel's own grants.", body, FG, 936)
    out.append((img, "The kernel is real: a boot transcript showing self-tests passing and the OS's program refused, granted, then run. From scratch for x86_64, ARM64 and RISC-V, driven by the desktop over a serial bridge."))

    # 9 status
    img, dr = base(F, 9, total, "status, honestly")
    dr.text((72, 190), "What works.", font=mid, fill=GREEN); dr.text((72, 262), "What doesn't yet.", font=mid, fill=RED)
    rows = [(True, "Desktop, ten apps, offline, deployed"), (True, "Anthropic, OpenAI-compatible, Gemini: streaming and tool calls"), (True, "Leases, ledger with undo, digest with snapshot and diff"), (True, "The kernel boots with the OS ramdisk and answers over the bridge, in CI"), (False, "The desktop running inside the kernel: it needs a network stack and a compositor first")]
    y = 380
    for ok, t in rows:
        dr.ellipse((72, y + 12, 96, y + 36), fill=GREEN if ok else RED)
        y = block(dr, (120, y), t, F("Inter-Regular.ttf", 32), FG if ok else MUTED, 880) + 26
    block(dr, (72, y + 20), "A status table that overstates is worse than none. Today the desktop runs in a browser and drives the kernel. Every choice, no server, no build step, no ambient authority, is made so that moving it onto the kernel is a port, not a rewrite.", body, MUTED, 936)
    out.append((img, "Status, honestly. Working: the desktop, the providers, leases and ledger, the kernel booting through the bridge in CI. Not yet: the desktop running inside the kernel."))

    # 10 CTA
    img, dr = base(F, 10, total, "open it")
    arcs(dr, 800, 380, 0.9)
    dr.text((72, 480), "Open it in", font=big, fill=FG); dr.text((72, 576), "your browser.", font=big, fill=BRASS)
    y = block(dr, (72, 700), "Nothing to install. Add a key in Settings. Everything stays on your machine.", body, MUTED, 936)
    dr.rounded_rectangle((72, y + 40, 1008, y + 120), radius=16, fill="#0d0f14", outline=CYAN, width=2)
    dr.text((100, y + 62), URL, font=F("JetBrainsMono-Regular.ttf", 34), fill=CYAN)
    y = block(dr, (72, y + 160), "Apache 2.0. Star it, fork it, add a provider. Built by Piyush Mishra under ni_sh_a.char.", body, FG, 936)
    out.append((img, "Call to action: open it in your browser at ni-sh-a-char.github.io/RESENTMENT. Nothing to install. Apache 2.0. Built by Piyush Mishra under ni_sh_a.char."))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "media", "carousel"))
    ap.add_argument("--fonts", default=None)
    args = ap.parse_args()
    d = ms.ensure_fonts(args.fonts)
    F = lambda n, s: ms.ImageFont.truetype(os.path.join(d, n), s)
    os.makedirs(args.out, exist_ok=True)
    alts = []
    for i, (img, alt) in enumerate(slides(F), 1):
        path = os.path.join(args.out, "slide-%02d.png" % i)
        img.save(path, optimize=True)
        alts.append("slide-%02d: %s" % (i, alt))
    open(os.path.join(args.out, "caption.txt"), "w", encoding="utf-8", newline="\n").write(CAPTION)
    open(os.path.join(args.out, "alt-text.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(alts) + "\n")
    print("  wrote %d slides, caption.txt and alt-text.txt into %s" % (len(alts), args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
