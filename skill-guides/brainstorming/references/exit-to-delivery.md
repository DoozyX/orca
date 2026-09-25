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
done means: every step in How it will be built is landed under the landing
            policy the run records, and the Testing Decisions hold on the landed code
report to: <the user, by the channel this brainstorm ran in>
user constraints: <the design's Out of scope section, verbatim, or "none">
```

An empty goal file is a launch blocker: verify it is non-empty before handing off.

## Hand the design to `delivery`

Load the `delivery` skill and give it the design's absolute path. Do not write
the implementation plan yourself; `delivery` decides whether the work needs a
planner at all, and its focused-first gate defaults to a single implementer.

Two ways to run it. Recommend the separate session by default; the user's own
words decide:

- **In a separate worktree** (default) — hand the design path and the goal path
  to a new agent with the `orca-cli` full-handoff flow, print one line naming
  the new worktree id and agent handle, and end the turn. This is a handoff, not
  supervision: open no Run, create no Task, and do not poll it or wait for
  results. The user can start the next design here immediately.
- **In this session** — only when the user explicitly wants to wait and watch.
  A coordinator lives for hours and holds this session for the whole run, so
  the user's next feature waits on this one's review rounds.

Either way the design is approved input. A session running `delivery` never
re-opens it, never brainstorms, and never waits for an approval that no one in
that session can give.

## What does not need this

A focused change goes straight to implementation in this session under the `tdd`
skill, with `verify` gathering the command evidence before any completion claim;
reach for `debug` if something breaks on the way and `review` for a second pass on
the diff. Any ADR the design produced lands in that same commit under `docs/adr/`.
Multi-file alone does not require coordination.
