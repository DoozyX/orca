---
name: delivery
description: >-
  The end-to-end delivery recipe that runs on top of Orca orchestration: take an
  approved design, an issue, or a task list through a dedicated implementer,
  independent review rounds with a durable attempt budget, a PR or the
  repository's own endgame, and green CI. Also runs deployed-system verification
  through independent evidence arms to exactly one of pass, defect, or
  inconclusive. Use the `orchestration` skill instead when the request is only
  to coordinate, supervise, or fan out agents; `delivery` is the recipe,
  `orchestration` is the runtime it runs on. Use `brainstorming` first when no
  approved design exists yet.
---

# Orca Delivery

This file is a discovery stub, not the usage guide. The full, version-matched Orca
delivery reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage delivery to take an approved design, an issue, or a task list through a dedicated
implementer, independent review rounds under a durable attempt budget, a pull request or the
repository's own endgame, and green CI — or to verify a deployed system through independent
evidence arms to exactly one of pass, defect, or inconclusive. Delivery is the recipe; the
`orchestration` skill is the coordination runtime it runs on, and it stays the authority on
every Run, Task, Dispatch, wait, gate, and release. Use `orchestration` alone when the
request is only to coordinate or supervise agents, and `brainstorming` first when no
approved design exists yet.

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

## Load the version-matched guide before starting a pipeline

```text
ORCA skills get delivery
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers entrance selection, the per-task pipeline, and the review budget.
For a conditional action gate such as running a task stage, verifying a deployed system, or
parking and reporting, load only the reference that gate names with
`ORCA skills get delivery --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`ORCA skills get delivery --full` and read the named bundled reference before acting.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If `skills get` is unknown, explain that updating Orca restores the guide; use
`--help` for read-only discovery and do not guess unsupported commands.
