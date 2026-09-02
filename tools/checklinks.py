#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Check that every internal link and anchor in a built site resolves.

A broken link in documentation is a small thing that reads as carelessness, and
it is the one class of documentation bug a machine can find. External links are
not fetched: a check that depends on the network fails for reasons that have
nothing to do with this repository.

  python tools/checklinks.py site
"""

import os
import re
import sys


def main(root):
    if not os.path.isdir(root):
        print("no such directory: %s" % root)
        return 1

    present = set(os.listdir(root))
    pages = sorted(f for f in present if f.endswith(".html"))
    if not pages:
        print("no pages in %s" % root)
        return 1

    broken = []
    for name in pages:
        with open(os.path.join(root, name), encoding="utf-8") as fh:
            text = fh.read()
        ids = set(re.findall(r'\sid="([^"]+)"', text))

        for href in re.findall(r'\shref="([^"]+)"', text):
            if href.startswith(("http://", "https://", "mailto:", "//", "data:")):
                continue
            if href.startswith("#"):
                if href[1:] not in ids:
                    broken.append((name, href, "no such anchor on this page"))
                continue
            target, _, anchor = href.partition("#")
            # A link to a directory resolves to its index, as a server would.
            if target.endswith("/") and os.path.exists(os.path.join(root, target, "index.html")):
                continue
            if target and target not in present:
                broken.append((name, href, "no such file"))
            elif anchor and target in present and target.endswith(".html"):
                with open(os.path.join(root, target), encoding="utf-8") as fh:
                    other = set(re.findall(r'\sid="([^"]+)"', fh.read()))
                if anchor not in other:
                    broken.append((name, href, "no such anchor in %s" % target))

        for src in re.findall(r'\ssrc="([^"]+)"', text):
            if src.startswith(("http://", "https://", "//", "data:")):
                continue
            t = src.split("#")[0]
            if t.endswith("/") and os.path.exists(os.path.join(root, t, "index.html")):
                continue
            if t not in present:
                broken.append((name, src, "no such file"))

    for page, href, why in broken:
        print("  %-20s %-40s %s" % (page, href, why))

    print("%d page%s checked, %d broken link%s"
          % (len(pages), "" if len(pages) == 1 else "s",
             len(broken), "" if len(broken) == 1 else "s"))
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "site"))
