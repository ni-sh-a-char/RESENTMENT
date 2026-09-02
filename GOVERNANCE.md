# Governance

Small project, honest structure. This document exists so that nobody has to
guess how a decision gets made.

## Who decides

RESENTMENT OS is maintained by **[@PIYUSH-MISHRA-00](https://github.com/PIYUSH-MISHRA-00)**,
who has final say on design and merges. That is a benevolent-dictator model,
and it is the right one at this size; pretending otherwise would be theatre.

It is intended to change. The path is written down here rather than left
implicit.

## Becoming a maintainer

There is no application. The maintainer invites people who have, over time,
landed changes that needed real judgement, reviewed other people's changes
usefully, and shown they will say "I don't know" and "this is wrong, including
when I wrote it". Maintainers get merge rights and are listed in
`.github/CODEOWNERS`. Areas can be owned separately: someone can own the
provider layer without owning the lease system.

## How decisions are made

**Ordinary changes.** One maintainer approval, CI green. If the author is a
maintainer, still one other approval.

**Design changes**, meaning anything that alters the `os` object's surface,
a tool's scope, what the digest covers, what the vault stores, or what leaves
the browser, go through an issue first with the alternatives written down.
The bar is not consensus; it is that the objections have been answered.

**Disagreement.** In the open thread. If it does not converge the maintainer
decides and records the reasoning. A decision with a written reason can be
revisited by someone with new information.

**Reverting.** Anything can be reverted by any maintainer if it breaks
`make test` or the deployed desktop. Re-landing after a fix is the normal
path.

## What "no" looks like

[ROADMAP.md](ROADMAP.md) has a section of things this project has decided not
to do, with the reason for each.

## Branches and releases

`v2.0.0` is the operating system; `main` is the website and these files;
`v1.0.0` is history. Semantic versioning on the OS as a whole:

- **Major**: the `os` surface, a tool's scope, the digest encoding, or the
  vault format changes in a way that breaks something that worked.
- **Minor**: new apps, tools, providers.
- **Patch**: fixes.

A release is tagged from the version branch only when `make test` and
`make qemu-test` both pass from a clean tree, and the kernel submodule points
at a tagged kernel release. `CHANGELOG.md` is written before the tag.

## The kernel

The kernel has its own governance, in its own repository. This project does
not carry kernel patches; it bumps the submodule pointer.

## Code of conduct

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies to every space this project
uses. Report to [@PIYUSH-MISHRA-00](https://github.com/PIYUSH-MISHRA-00), or
through a [private security advisory](https://github.com/ni-sh-a-char/RESENTMENT/security/advisories/new)
if the matter is sensitive.

## Licence and provenance

Apache 2.0, no CLA. If you contribute code you did not write, say so and say
where it came from. The Markdown renderer in `tools/mksite.py` came from the
kernel's site, by the same author, under the same licence, and is credited in
the file.
