---
name: tdd
description: >-
  Red/green/refactor discipline for writing a feature or a fix: write the
  failing test first, run it and watch it fail for the right reason, write the
  minimum code to pass, then refactor while it is green. Covers the gate before
  writing a test, the gate before adding a mock, and the mutation check that
  proves the new test protects something. Use before writing production code for
  a new behavior or a fix, and when tests are being added after the fact. This is
  not a debugging skill and not an evidence gate: use `debug` to find a cause
  before there is a test to write, and `verify` before claiming the work is done.
---

# Orca TDD

This file is a discovery stub, not the usage guide. The full, version-matched Orca
test-driven development reference is served by the `orca` binary itself — kept out of this
file on purpose so it can never drift from the binary that will actually run your commands.

Engage this skill before writing production code for a new behavior or a fix, and whenever
tests are being added after the fact. It runs the red/green/refactor cycle: write the
failing test first, run it and watch it fail for the right reason, write the minimum code to
pass, then refactor while it is green — with a gate before writing a test, a gate before
adding a mock, and a mutation check that proves the new test protects something. Use the
`debug` skill when the cause of a failure is not yet known, and `verify` before claiming the
work is done.

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

## Load the version-matched guide before writing the test

```text
ORCA skills get tdd
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It is self-contained apart from the shared principle lenses it names in the
refactor step, which live with the `review` topic. If that binary does not recognize the
topic, say so rather than guessing at the cycle.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ORCA open` or restart Orca. If
`skills get` is unknown, explain that updating Orca restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
