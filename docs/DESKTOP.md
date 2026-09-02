# The desktop

## Getting around

- **Ctrl+K** opens the intent bar. Type an app name to open it, `> ls` to run
  a terminal command, or anything else to ask the model. Arrow keys and Enter.
- **The dock** at the bottom holds every app. A dot under an icon means it is
  open; click to focus, click again to minimise.
- **The top bar** shows open windows on the left, and on the right: how many
  agents are working, the active leases and when the first expires, whether
  the kernel is attached, the digest, and the clock. Each is a button.
- Windows drag by their title bar, resize from the corner, and maximise on a
  double-click. On a phone every window is full-screen.

## The apps

### Ask

A conversation with one agent. Each Ask window is its own process with its
own budget and its own leases; open two for two parallel workers. Tool calls
appear inline as chips with their output. The status line shows the state,
the tokens used against the budget, and a resume button when the agent is
paused.

### Files

The virtual filesystem. Double-click a folder to enter it or a file to edit
it. Import brings files in from your machine (text, up to 4 MB each); Export
writes one out. Delete goes through the ledger and can be undone.

### Editor

Plain text with Ctrl+S. "Ask about this" opens an Ask window primed with the
file's path.

### Terminal

A small shell. `help` lists it. The same commands are what an agent runs
through its `shell_run` tool, so what you can do and what it can do are the
same list.

### Settings

- **Model**: pick a provider, paste a key, optionally set a base URL for a
  local or custom server, pick or fetch a model, test it, save it as the
  default.
- **You**: a name.
- **Agents**: the token budget per agent, the default lease length.
- **Vault**: set a passphrase to seal the keys at rest.
- **Appearance**: light or dark; accent keyed from the clock or fixed.
- **Kernel**: the bridge address.
- **Data**: export everything except keys as JSON; import it; erase.

### Agents

The process table: every agent with its state, tokens, calls and uptime;
pause, resume, kill. Below it every active lease with a ring that empties as
it expires, and a revoke button.

### Ledger

Everything that happened, newest first: tool calls with their input, denials,
file changes with the call that caused them, snapshots, undos. "Undo to here"
reverses every file change after a row and records that it did.

### Digest

The OS's root hash beside the kernel's. Take a named snapshot; select two and
diff them to see which paths changed. Attest exports a JSON document with the
roots and the snapshot list.

### Kernel

A console into the real kernel once the bridge is attached. Quick buttons for
the shell's dot-commands. When nothing is attached it explains how to.

### About

What this is, the four ideas, the shortcuts.

## The wallpaper

The current time, drawn as three arcs: the hour, the minute and the second
hand as fractions of their circles. The accent colour is derived from the
separation between the hour and minute hands, which sweeps the wheel about
eleven times a day. The kernel derives its keys from the same angles.
