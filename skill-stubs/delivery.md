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

<!-- shared: resolver -->

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

<!-- shared: no-guessing -->
