# Exit to delivery

Load this reference when an approved design is large enough to need the
implement, review, PR, and green-CI pipeline.

## Freeze the goal before anything is launched

This session is the only one still holding the user's original ask in their own
words. Write it down beside the design, as `goal.md` in the same run directory,
before handing anything on. A later coordinator keeps this file as-is and never
rewrites it; scope changes the user approves are appended, never substituted.

```text
# Goal
<the user's opening request to this brainstorm, verbatim and quoted, then the
 design's one-paragraph motivation, verbatim>

entrance: design
inputs: <absolute path to design.md>
done means: every unit in the Decomposition sketch is landed under the landing
            policy the run records, and the Testing Decisions hold on the landed code
report to: <the user, by the channel this brainstorm ran in>
user constraints: <the design's Out of scope section, verbatim, or "none">
```

An empty goal file is a launch blocker: verify it is non-empty before handing off.

## Hand the design to `delivery`

Load the `delivery` skill and give it the design's absolute path. Do not write
the implementation plan yourself; `delivery` decides whether the work needs a
planner at all, and its focused-first gate defaults to a single implementer.

Two ways to run it, and the user's own words decide which:

- **In this session** — the user is willing to wait and wants to watch the run.
  You become the coordinator for the whole pipeline, which can be long.
- **In a separate worktree** — the user wants this session back. Hand the design
  path and the goal path to a new agent with the `orca-cli` full-handoff flow,
  report the new worktree id and agent handle, and stop. This is a handoff, not
  supervision: open no Run, create no Task, and do not wait for results.

Either way the design is approved input. A session running `delivery` never
re-opens it, never brainstorms, and never waits for an approval that no one in
that session can give.

## What does not need this

A focused change goes straight to implementation in this session under the
repository's own test discipline, with command evidence before any completion
claim. Any ADR the design produced lands in that same commit under `docs/adr/`.
Multi-file alone does not require coordination.
