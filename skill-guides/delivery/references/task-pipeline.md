# Task pipeline

Load this reference when running a task's implement, review, fix, PR, or CI
stage. Every dispatch, wait, and release here is an `orchestration` operation;
this document owns only what to ask for and what settles it.

## Shared verification contract

Before the first stage, record one full-suite owner per worktree and revision,
together with the test command, the required services, and where the result
lands. Pass that assignment into every Task spec for the worktree. A completed
suite result may be reused only when the revision, tree state, environment, and
required checks all match; a changed revision or environment requires new
evidence. Do not certify a dirty or changing tree by HEAD alone. Reassign
ownership explicitly when an owner settles — an idle terminal does not prove its
jobs stopped.

## 1. Implement

One worktree per task, in the coordinator's own project and nested under the
coordinator's worktree, so the whole delivery run reads as one tree instead of a
row of unrelated top-level entries. Cut it explicitly from the base branch, never
from whatever branch happens to be checked out. Record the worktree path, branch,
HEAD, and the resolved base sha before the worker starts changing files; a
mismatch is a launch failure, not a baseline to work around.

```text
ORCA worktree create --name <task-slug> --parent-worktree active --base-branch <base> --json
ORCA orchestration worker-start --spec "<task spec>" --worktree id:<repoId>::<worktreePath> --agent claude --json
```

Lineage and Git base are separate decisions: `--parent-worktree active` nests the
task under the coordinator, and `--base-branch` is what keeps it off the
coordinator's branch. Never use `--no-parent` here — it detaches the task from the
run it belongs to. When a task needs its own lineage root, say so and pass an
explicit `--parent-worktree <selector>` rather than dropping the parent.

The spec tells the implementer to work strictly in that worktree and, in order:
install from the frozen lockfile; run the shared verification contract and record
only task-specific baseline deltas *before* touching anything; implement
test-first; rerun the full suite plus the repository's lint, format, and build
checks; verify end to end by driving the real surface where one exists; and
commit without pushing.

**The spec carries the binding rules distilled; paths are backup, not a reading
list.** Every path you include should be something the worker consults to check a
detail, never something it must read before it can start.

**Confirm the brief arrived.** A successful dispatch proves durable enqueue, not
that the agent took the brief up as a turn. Check that the worker is actually
working — a fresh heartbeat, or `worker-show` reporting a live agent that has
begun — before you count the stage as started.

## 2. Review

Dispatch a **fresh** reviewer into the **same worktree** once the implementer
settles. Record that worktree's HEAD at dispatch; every later round is scoped
against it as the reviewed sha.

Keep review read-only. Tool restrictions block editing tools but leave a shell
available, so the spec has to carry what flags cannot: no working-tree rewrites,
no stash, no branch or index mutation. A reviewer has swept a sibling's in-flight
work with one stash in a shared worktree.

**Never grant write authority without sole occupancy, in the same sentence.** If
a proof genuinely needs a mutation — flipping a guard, adding a union member —
the reviewer must be the only session in that worktree at the time, and the spec
must say both things together. Prefer a static proof and grant nothing.

The reviewer writes its findings to a file in the run's ignored directory and
reports only the merged findings and a machine-readable verdict line. Check the
file before building a fix round from it: if it is absent or missing its merged
findings anchor, the round failed — dispatch the reviewer again rather than
mailing an implementer a fix round with no findings in it.

Rounds after the first are full-branch rounds with the prior findings attached.
They take the diff since the reviewed sha as their focus and the diff since the
base as their scope, every unfixed prior finding is a new finding, and an item
already dispositioned is not re-raised.

## 3. Fix

Branch on the verdict directly.

- `clean` from **any** round is terminal for the task, because every round
  certifies the whole branch against a verified suite. Proceed to the PR.
- `fix-needed` splits by bucket. Ordinary defects go back to the same implementer
  as a fix round carrying the findings and nothing else. Items needing a product
  or scope decision go to the user, exactly like a worker's blocking question,
  and the task holds while you wait. Items explicitly deferred are recorded, named
  in the closing report, and never extend the loop.
- **The reviewer proposes a severity; you decide it.** A finding whose blast
  radius is existing data, introduced by this branch, is never minor — regrade it
  upward and send it back. Regrading downward needs a one-line written reason that
  goes into the closing report.
- Reuse the settled implementer's terminal for the fix round rather than
  dispatching a new one: it holds why the code took its shape, and a fresh session
  re-reads the branch before it can start. If that terminal is gone, record the
  deviation and dispatch a replacement into the same worktree with an instruction
  to read the log and branch diff first.
- A repeated in-scope defect across rounds is reviewer oscillation: escalate the
  reviewer rather than the round count. Adjacent or preventive scope is never
  smuggled into the branch because a late round mentioned it; each such finding
  gets a one-line disposition and only a `fix` enters the fix round.

## 4. PR

The branch was cut when the task started and the base has probably moved. Have
the implementer fetch and merge the current base, resolve conflicts preserving
both sides' intent, rerun the full suite **and** the build checks — an automatic
merge can compile and still be wrong — commit the merge, and push.

```bash
gh pr create --base <base-branch> --title "<title>" --body "<body>"
```

On a fork, be fully explicit or `gh` stops to ask interactively, which hangs a
non-interactive worker: add `--repo <upstream-owner>/<repo>` and
`--head <fork-owner>:<branch>`.

**Not every repository ends this way.** A GitLab project wants `glab` and a merge
request; a repository's own `CLAUDE.md` or `CONTRIBUTING.md` may prescribe merging
into a development branch with no pull request at any point. The repository's
stated workflow wins. Read it during setup, confirm the endgame with the user
once when it diverges, then use it for every task in the run. Everything upstream
is unchanged; only the last hop and how "green" is observed translate.

The PR body covers what changed, why, and how it was verified, plus the issue
reference for an issue-sourced task. It carries no run-directory paths, no
terminal handles, and no orchestration detail.

## 5. Green CI

Dispatch a cheap inspection worker for the open PRs rather than polling from the
coordinator. It runs the host's check command, writes a compact status artifact,
and on failure pulls the failing log into the task's directory. You read the
deciding green or red summary and route the result to the still-live implementer.

A mechanical fix — lint, format, a flaky rerun — pushes directly. A fix that
touches logic takes one `review-round` on the new commits, scoped from the sha the
last clean review saw, before the task can count as done. When a sibling PR from
this run merges, rerun stage 4's sync for every still-open PR: the base just moved
under them.

A task is **done** only when the review verdict is clean, the PR exists or the
prescribed endgame has landed, and all checks are green.
