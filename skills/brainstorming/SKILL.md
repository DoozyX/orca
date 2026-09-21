---
name: brainstorming
description: >-
  Collaborative design before any code is written: explore the repository's own
  context, ask clarifying questions one frontier round at a time, offer 2-3
  approaches with trade-offs and a recommendation, then write and self-review a
  complete design file the user reads and explicitly approves. Use when the user
  says "let's build", "I want to add", "how should we do X", or asks for a
  design or a spec, and before any feature, behavior change, or refactor of
  consequence. Hard-gates implementation until that file is approved. Use the
  `delivery` skill to execute an approved design, and `orchestration` when the
  request is only to coordinate or supervise agents.
---

# Orca Brainstorming

This file is a discovery stub, not the usage guide. The full, version-matched Orca
brainstorming reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage brainstorming before any feature, behavior change, or refactor of consequence, and
whenever the user says "let's build", "I want to add", "how should we do X", or asks for a
design or a spec. It runs a frontier-round question loop, offers 2-3 approaches with
trade-offs, writes and self-reviews a design file in a workspace-local ignored directory,
and hard-gates implementation until the user explicitly approves that file. Use the
`delivery` skill to execute an approved design, and the `orchestration` skill when the
request is only to coordinate or supervise agents. A session running under a live injected
Task/Dispatch preamble does not brainstorm: its Task spec is the contract.

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

## Load the version-matched guide before writing any design

```text
ORCA skills get brainstorming
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers the normal design loop through to the approval gate. For a
conditional action gate such as delivering a question round, writing the design file, or
handing an approved design to `delivery`, load only the reference that gate names with
`ORCA skills get brainstorming --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`ORCA skills get brainstorming --full` and read the named bundled reference before acting.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If `skills get` is unknown, explain that updating Orca restores the guide; use
`--help` for read-only discovery and do not guess unsupported commands.
