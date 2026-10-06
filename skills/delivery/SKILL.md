---
name: delivery
description: >-
  The end-to-end delivery recipe that runs on top of Orca orchestration: take an
  approved design, an issue, or a task list through a dedicated implementer,
  independent review rounds with a durable attempt budget, a PR or the
  repository's own endgame, and green CI. Also runs deployed-system verification
  through independent evidence arms to exactly one of pass, defect, or
  inconclusive. This is not a coordination runtime and not a design skill: use
  the `orchestration` skill when the request is only to coordinate, supervise, or
  fan out agents, because `delivery` is the recipe, `orchestration` is the runtime
  it runs on, and use `brainstorming` first when no approved design exists yet.
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
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ORCA open` or restart Orca. If
`skills get` is unknown, explain that updating Orca restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.

## Automatic workspace organization

This placement policy supplements the loaded guide and its handoff defaults.
An injected Task/Dispatch uses its assigned workspace; these rules are for coordinators.

- Every effort has one named parent workspace for its coordinator and worker tree.
  Read `<root-run-directory>/workspace.md` from brainstorming and reuse the exact
  host, workspace id/path, and run directory. Do not create a second root for delivery
  or reuse another effort merely because its product name matches.
- For an issue or task-list entrance without that record, load `worktree-safety`
  and `orca-cli`, discover the target, and create an independent parent using
  `worktree create --repo <exact-selector> --name <effort-slug> --no-parent --setup skip
  --json`, without activation or an agent. Give it a product/effort display name with
  `worktree set`, then record its exact identity in `workspace.md` beside the run's
  design/orchestrate directories. These are workspace trees, not Project Groups;
  never move the entire repository to organize one effort.
- Start a new coordinator terminal in that parent through the `orca-cli` handoff
  flow before opening the Run or launching workers. When already there, continue.
  Pass the approved inputs, workspace record, and this placement policy in the
  handoff. Do not relocate or restart an existing live coordinator.
- Verify the coordinator's workspace before dispatch. Local worker checkouts use
  `--worktree new-child`; workers sharing an existing checkout use its exact selector
  within this effort. Reuse existing safe checkouts; not every reviewer needs a new
  worktree. Keep worker lists scoped with `--run <run-id>`.
- When adopting existing work, verify ownership first and use
  `worktree set --worktree id:<child-id> --parent-worktree id:<parent-id> --json`.
  Change only Orca parent metadata; preserve paths, branches, and running terminals.
  Record the before/after mapping. A coordinator still running in a shared root is
  an explicit placement limitation, not permission to move its session.
- Remote workers follow orchestration's exact remote placement rules: remote
  `new-child` is invalid. Keep their Dispatches in this Run and record their host
  and workspace explicitly; do not claim cross-host sidebar nesting.
- Folder workspaces use the supported folder flow and exact workspace selectors,
  never Git worktree creation. If an effort's parent cannot be verified, report the
  placement blocker before launching workers; do not silently mix it into `main`.
