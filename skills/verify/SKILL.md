---
name: verify
description: >-
  The evidence gate before any completion claim: every "it works", "tests pass",
  "fixed", or "done" must be backed by a command run in the same message with its
  output shown, checked against the request as it was actually stated rather than
  as you remember it. Use before committing, opening a pull request, reporting a
  task complete, or telling anyone something is working. This is not a testing
  skill and not a review skill: use `tdd` to write the tests, `review` to look
  for defects, and `debug` to find a cause when the evidence comes back red.
---

# Orca Verify

This file is a discovery stub, not the usage guide. The full, version-matched Orca
verification reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage this skill before committing, opening a pull request, reporting a task complete, or
telling anyone that something works. It is the evidence gate: every "it works", "tests
pass", "fixed", or "done" must be backed by a command run in the same message with its
output shown, and checked against the request as it was actually stated rather than as you
remember it. Use the `tdd` skill to write a missing test, `debug` when the evidence comes
back red and the cause is unknown, and `review` when the question is whether the change is
correct rather than whether it ran.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. Orca exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `orca-dev`.
- Otherwise, on Linux outside an Orca-managed terminal, use `orca-ide`. Never run bare
  `orca` there — outside Orca's terminals it normally resolves to the
  GNOME Orca screen reader (`/usr/bin/orca`) and starts speech on the user's machine.
- Otherwise, use `orca`.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Orca build.

## Load the version-matched guide before making any completion claim

```text
ORCA skills get verify
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It is self-contained: this topic has no conditional references, so read it
and gather the evidence it names. If that binary does not recognize the topic, say so rather
than guessing at what counts as evidence.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If `skills get` is unknown, explain that updating Orca restores the guide; use
`--help` for read-only discovery and do not guess unsupported commands.
