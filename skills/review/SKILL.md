---
name: review
description: >-
  Multi-layer code review of a diff, a branch, or a pull request: an adversarial
  pass starved of the author's intent, a mechanical edge-case path trace, and a
  verification-gap check, plus a deletion check when code was removed, merged
  into one deduplicated, severity-graded, triaged findings list ending in a
  machine-readable verdict. Use when the user asks to review changes, wants a
  second opinion before committing or merging, or when a dispatched reviewer is
  told to run the shared review layers. This is not a debugging skill and not an
  evidence gate: use `debug` when something is already misbehaving, `tdd` when
  the gap is a missing test, and `verify` to back a completion claim.
---

# Orca Review

This file is a discovery stub, not the usage guide. The full, version-matched Orca
review reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage this skill when the user asks to review changes, a diff, a branch, or a pull request,
wants a second opinion before committing or merging, or when a dispatched reviewer is told
to run the shared review layers. It runs an adversarial pass starved of the author's intent,
a mechanical edge-case path trace, and a verification-gap check — plus a deletion check when
code was removed — and merges them into one deduplicated, severity-graded, triaged findings
list ending in a machine-readable verdict. Review is read-only. Use the `debug` skill when
something is already misbehaving, `tdd` when the gap is a missing test, and `verify` to back
a completion claim.

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

## Load the version-matched guide before running any layer

```text
ORCA skills get review
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers target resolution, layer scoping, merging, and the verdict. Each
layer is a conditional action gate: load only the one you are about to run with
`ORCA skills get review --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`ORCA skills get review --full` and read the named bundled reference before acting.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If `skills get` is unknown, explain that updating Orca restores the guide; use
`--help` for read-only discovery and do not guess unsupported commands.
