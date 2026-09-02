# Security policy

## Reporting a vulnerability

Report privately, not in a public issue.

- **Preferred:** [open a draft security advisory](https://github.com/ni-sh-a-char/RESENTMENT/security/advisories/new)
  on this repository.
- **Alternative:** message the maintainer, [@PIYUSH-MISHRA-00](https://github.com/PIYUSH-MISHRA-00), on GitHub.
- **In the kernel:** the [kernel repository's policy](https://github.com/ni-sh-a-char/RESENTMENT---kernel/blob/main/SECURITY.md) applies.

Include the commit or tag, the browser, the provider if it matters, what an
attacker gains, and the smallest reproduction you have. A ledger export is
often the best one.

We will acknowledge within **five days** and give you an assessment within
**fourteen**. If we disagree that something is a vulnerability we will say so
and explain why.

## Supported versions

| Version | Supported |
|---|---|
| `2.0.x` | yes |
| `1.0.x` | no — the Linux distribution, kept as a branch for history |

## What the OS promises

- **Your key stays in your browser.** It is stored in IndexedDB, plain by
  default or sealed under a passphrase with AES-GCM and PBKDF2. It is sent in
  exactly one place: the request to the provider endpoint you configured. It
  is never in the digest, never in an export, never in a URL.
- **There is no RESENTMENT server.** The desktop is static files. Nothing
  phones home. There is no telemetry.
- **Agents start with nothing.** Every tool needs a lease for its scope, every
  lease has a deadline, and every call is in the ledger.

## Scope

| Area | Why a bug there is a vulnerability |
|---|---|
| `os/desktop/js/agent.js` — `runTool()` | the check between a model and the filesystem, the shell, the kernel |
| `os/desktop/js/core.js` — `Leases`, `covers()` | what a grant for one scope covers |
| `os/desktop/js/core.js` — `Vault` | keys at rest |
| `os/desktop/js/providers.js` — `buildRequest()` | where a key is sent |
| `os/desktop/js/apps.js` — anything using `innerHTML` | the model's output and the user's files are untrusted text; everything rendered goes through `esc()` or `md()` |
| `os/bridge/bridge.py` | it relays bytes to a kernel in ring 0, from whoever holds the WebSocket |

## What we already say out loud

Documented limits, not vulnerabilities.

- **The browser is the trust boundary.** Anything with access to your browser
  profile can read a plain key. The passphrase seals it at rest; it does not
  protect a key in memory while the vault is unlocked.
- **Leases are enforced by the desktop's own code.** They are not a sandbox
  against the desktop itself; they are a sandbox around the model. A malicious
  page served as the desktop is not a threat model the desktop can defend
  against, which is why the desktop is static files you can read and host.
- **The bridge binds to localhost with no authentication.** Any local process
  can attach to it and type into the kernel. It is a development bridge.
- **`web_fetch` is whatever the browser allows.** CORS is the provider's
  policy, not ours.
- **The digest is not sealed.** A browser has no secret the user does not, so
  an attestation from the desktop is a claim, not a proof. The kernel's seals
  are the proof, and `pulse.she` produces one.

## Disclosure

Coordinated, with a **90-day** default embargo, shortened if a fix ships
sooner. You will be credited in the advisory and in `CHANGELOG.md` unless you
ask not to be.
