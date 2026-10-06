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

<!-- shared: resolver -->

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

<!-- shared: no-guessing -->

## Automatic workspace organization

This placement policy supplements the loaded guide. Apply it for each new initiative;
an injected Task/Dispatch keeps its assigned workspace and never creates another root.

- Keep one named parent workspace per brainstorming-to-delivery effort, such as
  `Saddlebook — child login` or `Dooday — padel scoring`. These are nested workspaces,
  not Project Groups: never move the whole repository into a new Project Group.
- Reuse the exact parent recorded for this effort. Otherwise load `worktree-safety`
  and `orca-cli`, discover the repository, and create an independent parent using
  `worktree create --repo <exact-selector> --name <effort-slug> --no-parent --setup skip
  --json`, without an agent, activation, or an implementation prompt. Name it with
  `worktree set --worktree id:<returned-id> --display-name "<product> — <effort>" --json`.
  Use the repository's default base; parentage never means branching from a worker.
- Record the execution host, exact parent workspace id/path, and root run-directory
  path in `<root-run-directory>/workspace.md`. Resumes reuse that record; matching
  a product name alone is not enough to identify an effort.
- Keep design evidence in the root worktree's ignored run directory. Creating the
  organizational parent launches no worker, Run, or Task and does not approve code.
- After approval, pass `workspace.md` with the design and goal paths to delivery.
  A separate delivery session starts in the recorded parent workspace, using a new
  terminal there rather than creating another independent coordinator worktree.
  Keep the original session where it is; do not move or restart its live agent.
- For a plain folder, reuse or create a named folder workspace through Orca's
  supported folder-workspace flow; never invoke Git to obtain a group. If the
  execution host cannot provide that flow, report the limitation without switching
  hosts or pretending a Git worktree exists.
- If placement cannot be verified, keep designing and report the blocker; delivery
  must resolve it before launching workers. Do not silently use the shared `main`
  workspace as the coordinator for a new effort.
