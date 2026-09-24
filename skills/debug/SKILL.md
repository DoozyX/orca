---
name: debug
description: >-
  Systematic root-cause debugging for a bug, a failing test, or any unexpected
  behavior: read the real error, reproduce it, find the first boundary where the
  value is already wrong, compare against a working case, and test one
  falsifiable hypothesis at a time. Stops hard after three failed fixes to
  question the architecture instead of attempting a fourth. Use as soon as
  something breaks and before proposing or applying any fix. This is not a
  review skill and not an evidence gate: use `review` to look for defects in a
  diff that is not misbehaving, `tdd` to write the reproduction test, and
  `verify` to back the claim that the bug is fixed.
---

# Orca Debug

This file is a discovery stub, not the usage guide. The full, version-matched Orca
debugging reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage debugging as soon as a bug, a failing test, or any unexpected behavior appears, and
before proposing or applying any fix. It runs investigation before repair: read the real
error, reproduce it, find the first boundary where the value is already wrong, compare
against a working case, and test one falsifiable hypothesis at a time — with a hard stop
after three failed fixes to question the architecture instead of attempting a fourth. Use
the `review` skill when the question is what else is wrong in a change that is not
misbehaving, `tdd` to write the reproduction test, and `verify` to back the claim that the
bug is fixed.

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

## Load the version-matched guide before applying any fix

```text
ORCA skills get debug
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It is self-contained: this topic has no conditional references, so read it
and work the phases in order. If that binary does not recognize the topic, say so rather
than guessing at the investigation order.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ORCA open` or restart Orca. If
`skills get` is unknown, explain that updating Orca restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
