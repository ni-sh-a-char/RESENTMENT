<!--
Thanks for sending this. A short description of *why* is worth more than a long
description of *what* — the diff already says what.

Pull requests for the OS go against v2.0.0. Pull requests for the website or
the community files go against main.
-->

## What this changes

## Why

## How it was tested

- [ ] `make test` — the desktop under Node, the bridge against a fake kernel
- [ ] `make qemu-test` — the real kernel through the bridge
- [ ] Opened the desktop in a browser and used the changed part (say which browser)
- [ ] Not testable automatically, because:

```
paste the output here
```

## Checklist

- [ ] No new dependency. The desktop is static files; the bridge is the standard library.
- [ ] Nothing new leaves the browser except a request to the provider the user chose.
- [ ] Anything an app can do, an agent can be granted — no privileged UI paths.
- [ ] A deliberate simplification with a known ceiling is marked with a `ponytail:` comment naming the ceiling and the upgrade path.
- [ ] `docs/` updated if this changes behaviour a user or an agent would notice.
- [ ] `CHANGELOG.md` updated if a user would notice.

## Anything you are unsure about
