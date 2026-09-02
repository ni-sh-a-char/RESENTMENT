# The digest

The whole OS as one number.

## What is hashed

```
file       sha256("file\0" + path + "\0" + bytes)
directory  sha256("dir\0"  + name + "\0" + sorted child digests)
settings   sha256("settings\0" + canonical JSON of the settings)
root       sha256("os\0" + tree root + "\0" + settings digest)
```

Canonical JSON sorts keys and has no whitespace, so the same settings always
hash the same. Child digests are sorted, so the order files were created in
does not matter.

## What is not

- **Timestamps.** `mtime` is kept for display and excluded from the hash, as
  the kernel excludes timestamps, ids and pointers from its own canonical
  encoding. Two machines with the same files should agree on the number even
  if they wrote them at different times.
- **Keys.** The vault stores them under keys the digest never reads. The
  settings object holds no key material. A key in the vault does not move
  the root, and the tests check that it does not.
- **The ledger and the snapshots.** They are the history of the state, not
  the state; a snapshot that changed the digest could never match anything.

## Snapshots

A snapshot is `{name, root, nodes, ts}` where `nodes` maps every path to its
digest at that moment. Take one from the Digest window, the terminal
(`snapshot before`), or let an agent take one with `os_snapshot`.

## Diff

Two snapshots' node maps, compared: which paths were added, removed, or
changed. A changed file changes every ancestor directory and the root, and
nothing else, so the diff of a one-file change lists that file and its
parents.

## Attest

Exports a JSON document:

```json
{
  "resentment_os": "2.0.0",
  "attested": "2026-09-02T10:00:00.000Z",
  "root": "…",
  "tree": "…",
  "settings": "…",
  "kernel": "… or null",
  "snapshots": [{ "name": "before", "root": "…", "ts": 0 }]
}
```

It is a claim about a state at a time. The desktop cannot seal it the way the
kernel seals its snapshots with a Kaalka epoch key, because a browser has no
secret the user does not; when the kernel is attached, `pulse.she` in the
ramdisk seals the kernel's root for sixty seconds and prints the seal, and
that is the part of the attestation a third party can check.

## The kernel's digest

When the bridge is attached, the Digest window shows the kernel's root beside
the desktop's. They are two different trees over two different machines, and
the point of showing them together is that they are the same kind of thing:
one number that names a whole system, that changes when the system does and
not otherwise.
