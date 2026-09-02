# Contributing to RESENTMENT OS

Patches, bug reports and new providers are welcome. This document is short
because most of what matters is enforced by `make test` rather than by review.

---

## Branches

| Branch | What it is | Send pull requests here for |
|---|---|---|
| `v2.0.0` | the operating system: the kernel submodule, the desktop, the bridge, the tests, the docs | anything under `os/`, `tests/`, `docs/`, the Makefile |
| `main` | the website and the community files | anything under `web/`, `tools/`, this file and its siblings |
| `v1.0.0` | the Linux distribution, frozen | nothing; it is history |

The kernel is a submodule. A change to it goes to the
[kernel repository](https://github.com/ni-sh-a-char/RESENTMENT---kernel); this
repository then bumps the pointer.

A branch and a tag share a name here, which git allows but treats as
ambiguous: `git checkout refs/heads/v2.0.0` for the branch,
`refs/tags/v2.0.0` for the tag.

## Before you send anything

```sh
make test          # the desktop under Node, the bridge against a fake kernel
make qemu-test     # the real kernel through the bridge, if you have QEMU
```

Then open the desktop in a browser and use the part you changed. Say which
browser in the pull request. "Tests pass" and "it works in Firefox" are
different claims.

For the website:

```sh
sh tools/fetch-v2.sh && python3 tools/mksite.py --serve
```

---

## What the code should look like

Match the surrounding file. Beyond that:

- **No dependencies**, with one exception. The desktop is static files and ES
  modules; the bridge is the Python standard library; the WebLLM runtime is
  loaded from a pinned CDN URL only when the in-browser provider is chosen,
  because a GPU inference engine is not something to rewrite. A pull request that adds a `package.json`
  with dependencies, a bundler, or a framework will be asked what it needed
  that the platform does not provide.
- **No server.** Nothing leaves the browser except a request to the provider
  the user configured. A feature that needs a server is a feature that needs
  a design discussion first.
- **No privileged UI.** Anything an app can do through `os`, an agent can be
  granted through a tool. If you add an app action, ask whether it is a tool
  with a scope.
- **Logic without the DOM.** New behaviour goes in `core.js`, `agent.js`,
  `providers.js`, `shell.js` or `kernel.js`, where Node can test it. The DOM
  files render.
- **Tabs for indentation** in JavaScript and Python follows PEP 8. Lines
  under 100 columns where it does not hurt.

## What the comments should say

**Comments explain why, not what.** The reason a piece of code is shaped the
way it is: the constraint that forced it, the alternative that was rejected,
the failure it prevents.

If you make a deliberate simplification with a known ceiling, mark it and
name the upgrade path:

```js
/* ponytail: the whole tree lives in memory, which is fine to a few tens of
 * megabytes; move to per-file IndexedDB reads if a user ever imports a
 * video. */
```

They are greppable, and they are how the tree stays honest about what it
postponed.

## Tests

New logic gets a check in `tests/`. The harness is `node --test` and
`node:assert/strict`; no framework, no fixtures beyond a `fresh()` helper.
**Write the test so that it fails if you break the thing.** A test that
searches the whole transcript for a short string will pass against a kernel
that never received a byte; the kernel's own harness learned that the hard
way.

A new provider gets a request-shaping test and a stream-parsing test against
a recorded stream in `tests/providers.test.js`. A new tool gets a test in
`tests/agent.test.js` that grants and denies its scope.

## Adding a provider

See [docs/PROVIDERS.md](https://github.com/ni-sh-a-char/RESENTMENT/blob/v2.0.0/docs/PROVIDERS.md).
If it speaks one of the three wire formats, it is one table row.

## Security

If you find something exploitable, open a private report rather than a public
issue. The places that deserve the most suspicion:

- `runTool()` in `agent.js`: the only thing between a model and the filesystem
- `covers()` in `core.js`: what a lease for one scope grants for another
- the vault: what is at rest, and whether anything reads it that should not
- `buildRequest()`: where a key goes, and where it must not
- the bridge: it relays bytes to ring 0

## Licence

Contributions are under Apache 2.0, the same as the rest of the tree. There
is no CLA; opening the pull request is the agreement.
