#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Render the social preview card for RESENTMENT OS.

1280x640, the size GitHub, X and LinkedIn all rasterise from. Generated
rather than drawn, so the version and the claims cannot drift from the tree.
Needs Pillow. Fonts are fetched from Google Fonts once and cached under
build/fonts; pass --fonts DIR to use a directory you already have.

    python tools/mksocial.py                   # writes web/social-preview.png
    python tools/mksocial.py --fonts ../RESENTMENT---kernel/build/fonts
"""
import argparse
import math
import os
import re
import sys
import urllib.request

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow is required: pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "build", "fonts")
OUT = os.path.join(ROOT, "web", "social-preview.png")
FONTS = {
    "Inter-Regular.ttf": "Inter:wght@400",
    "Inter-SemiBold.ttf": "Inter:wght@600",
    "Inter-Bold.ttf": "Inter:wght@700",
    "JetBrainsMono-Regular.ttf": "JetBrains+Mono:wght@400",
}
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def ensure_fonts(explicit):
    d = explicit or CACHE
    os.makedirs(d, exist_ok=True)
    for name, fam in FONTS.items():
        path = os.path.join(d, name)
        if os.path.exists(path):
            continue
        # Without a browser user agent Google serves WOFF2, which Pillow
        # cannot read; with one it serves plain TTF.
        req = urllib.request.Request("https://fonts.googleapis.com/css2?family=" + fam, headers={"User-Agent": "Wget/1.21"})
        css = urllib.request.urlopen(req).read().decode()
        m = re.search(r"url\((https://[^)]+\.ttf)\)", css)
        if not m:
            sys.exit("could not find a ttf for %s" % name)
        urllib.request.urlretrieve(m.group(1), path)
        print("  fetched %s" % name)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts", default=None)
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    d = ensure_fonts(args.fonts)
    F = lambda n, s: ImageFont.truetype(os.path.join(d, n), s)

    W, H = 1280, 640
    img = Image.new("RGB", (W, H), "#07080b")
    dr = ImageDraw.Draw(img, "RGBA")

    # Ground: a soft warm glow top right, and the three clock arcs the
    # desktop draws as its wallpaper, at the time the card was made.
    for r in range(700, 0, -6):
        a = int(9 * (1 - r / 700) ** 2.4)
        dr.ellipse((1010 - r, 250 - r, 1010 + r, 250 + r), fill=(224, 165, 69, a))
    import datetime
    n = datetime.datetime.now()
    s = n.second; m = n.minute + s / 60; h = (n.hour % 12) + m / 60
    cx, cy = 1010, 250
    for frac, r, col, w in ((1, 230, (255, 255, 255, 18), 2), (1, 180, (255, 255, 255, 18), 2), (1, 130, (255, 255, 255, 18), 2),
                            (h / 12, 130, (224, 165, 69, 230), 22), (m / 60, 180, (79, 214, 210, 200), 12), (s / 60, 230, (224, 165, 69, 140), 4)):
        dr.arc((cx - r, cy - r, cx + r, cy + r), -90, -90 + 360 * frac, fill=col, width=w)

    # Eyebrow, title, tagline.
    dr.text((72, 74), "●", font=F("Inter-Bold.ttf", 14), fill="#64d68a")
    dr.text((94, 70), "RESENTMENT OS  2.0.0  prahar", font=F("JetBrainsMono-Regular.ttf", 18), fill="#9aa4b6")
    dr.text((68, 130), "Give an AI", font=F("Inter-Bold.ttf", 92), fill="#e6e9ef")
    dr.text((68, 228), "a computer.", font=F("Inter-Bold.ttf", 92), fill="#e6e9ef")
    dr.text((68, 326), "Take it back at", font=F("Inter-Bold.ttf", 92), fill="#e0a545")
    u = n + datetime.timedelta(minutes=15)
    dr.text((68, 424), "%02d:%02d." % (u.hour, u.minute), font=F("Inter-Bold.ttf", 92), fill="#4fd6d2")

    dr.text((72, 540), "An AI operating system on its own kernel and your own key.", font=F("Inter-SemiBold.ttf", 24), fill="#e6e9ef")
    dr.text((72, 578), "authority expires · one hash · agents are processes · any provider · no server",
            font=F("JetBrainsMono-Regular.ttf", 15), fill="#6b7488")

    # The URL, bottom right.
    f = F("JetBrainsMono-Regular.ttf", 16)
    url = "ni-sh-a-char.github.io/RESENTMENT"
    tw = dr.textlength(url, font=f)
    dr.text((W - 72 - tw, 578), url, font=f, fill="#4fd6d2")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    img.save(args.out, optimize=True)
    print("  wrote %s (%dx%d)" % (os.path.relpath(args.out, ROOT), W, H))
    return 0


if __name__ == "__main__":
    sys.exit(main())
