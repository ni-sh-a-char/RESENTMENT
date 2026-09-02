# Agents

An agent is a process. It has an id, a name, a state, a token budget, an
empty set of permissions at birth, and a row in the process table with a
kill button.

## The loop

```
send(text)
  │
  ├─ append the user turn
  └─ loop:
       budget reached?  → pause, stop
       call the provider, stream the reply
       text          → shown as it arrives
       tool call     → collected
       stop reason   → end_turn: idle, stop
                       tool_use: for each call, runTool(); append results; loop
```

`runTool()` is where the permission system lives:

```
tool named?           no → error result the model sees
lease for its scope?  no → state "waiting"; ask the user; denied → error result
record the call in the ledger
run it, with actor = this agent and cause = that ledger entry
record the result or the error
```

A refusal is a `tool_result` with `is_error`, not an exception. The model sees
"permission denied: the user did not grant fs.write" and can say so, ask, or
do something else.

## Tools and scopes

| Tool | Scope | Does |
|---|---|---|
| `fs_list`, `fs_tree`, `fs_read` | `fs.read` | read the filesystem |
| `fs_write`, `fs_delete` | `fs.write` | change it; every change names its cause |
| `shell_run` | `shell` | one terminal line, the same commands the Terminal app has |
| `kernel_eval` | `kernel` | one line to the kernel's shell over the bridge |
| `web_fetch` | `web` | GET a URL, first 20 000 characters, where CORS allows |
| `os_open`, `os_notify`, `os_snapshot` | `os` | open an app, show a toast, take a snapshot |

Scopes are dotted: a lease for `fs` covers `fs.read` and `fs.write`; `*`
covers everything. The desktop only ever offers the exact scope asked for.

## Leases

A lease is `{subject, scope, until}`. The check is against the clock every
time, so a lease that has expired is simply not there. The dialog offers
five minutes, the default from Settings, an hour and a working day. There is
no "always". Killing an agent revokes its leases; a lease granted while a
kill is in flight is revoked too.

This is the desktop's version of the kernel's Kaalka seal: authority with a
deadline inside it, so a forgotten permission stops working without anybody
remembering to revoke it.

## Budgets

Input and output tokens both count. An agent that reaches its budget pauses
with the reason shown in its window and in the process table; raise the
budget and resume. Providers that report usage only at the end of a stream
(OpenAI-compatible, Gemini) are counted at the end; Anthropic reports input
at the start and output at the end.

## The ledger

Every tool call is an entry `{seq, ts, actor, kind: "tool", tool, scope,
input, lease}`. Every file change is an entry `{kind: "fs.write", path,
before, actor, cause}` where `cause` is the tool call's `seq`. Denials and
errors are entries. Snapshots are entries. Undo reverses the file changes
after a point, newest first, marks them undone, and appends an `undo` entry
naming what it reversed. Nothing is ever deleted from the ledger.

## The system prompt

Built in `systemPrompt()` from the agent's name and id, the user's name, the
rules above in plain language, the current digest, whether the kernel is
attached, and the date. It tells the model to ask for as little as the task
needs, to say what it intends before a write, and not to narrate tool calls
the user can already see.

## Parallel agents

Every Ask window is an agent. Open three and give them three tasks. They
share the filesystem and the ledger, and each holds its own leases.
