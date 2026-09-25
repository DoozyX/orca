# Planning and splitting

Load this reference when the focused-first gate has recorded a planning trigger,
when you were handed a plan, or when one large task must be split. The end state
of a split is always one branch and one PR or endgame for the issue.

## Planner

One planner worker in its own worktree writes, under the run directory's
`plan/<unit>/`, a `plan.md` and one task file per task at
`tasks/task-NN-<name>.md`. It implements nothing, commits nothing, and its
worktree's `git status --porcelain` is empty when it settles; a non-empty
worktree means it wrote into the branch, and nothing launches until that is
repaired.

Each task file stands alone beside the approved design:

| Section                   | Content                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Requirement               | Absolute design path (and addendum, if any), the `US-` ids it covers, and a concise summary of the requirement this task owns |
| Acceptance                | Observable criteria, plus a `## Quality bar` with anchored 0–10 scales only for criteria a test cannot assert                 |
| Scope                     | Paths or subsystems and the responsibility each carries                                                                       |
| Verification              | Commands and the evidence they must produce                                                                                   |
| `## Interfaces`           | `consumes:` and `produces:` — exact names, signatures, and paths neighbours rely on                                           |
| `tier:`                   | `standard` or `strong`, per `task-pipeline.md`; never below standard for an implementer                                       |
| `## Record (append-only)` | Left empty; the implementer appends commits, touched files, and concerns in place                                             |

A design's build steps (`## How it will be built`) are the task list, in their
order, with their interfaces and `Done when` criteria: the planner elaborates
steps and never re-decomposes them. No
production code, no predicted command output, no placeholders.

## Plan review: one review, at most one amendment

Review the plan only when it feeds two or more implementers or settles a
recorded high-risk shared contract. One implementer's plan needs none: its code
reviewer holds the whole spec and the whole diff.

| In scope                                                     | Out of scope                                  |
| ------------------------------------------------------------ | --------------------------------------------- |
| Coverage: every design requirement maps to a task            | Code-quality opinions on code not yet written |
| Placeholders: TBD, "add error handling", "similar to task N" | Exact test-output predictions                 |
| Contradictions and cross-task interface mismatch             | Details that change no cross-task contract    |
| Ordering, and parallel-safe marks on tasks that share files  |                                               |
| Obviously wrong tier tags                                    |                                               |

One fresh read-only reviewer, the code-review findings format and verdict line.
Findings go back to the planner once; for a handed-in plan, to a worker scoped
to applying them, or to the user. Then proceed: no re-review, no loop, and no
`budget.md` rows. Never edit the plan yourself.

Stop instead of proceeding when findings invalidate the **design** — that is the
user's call. **If planning fails** — the planner runs out of room, emits an
implementation-sized artifact, or draws findings across most tasks — do not start
a second planner. Collapse to one strong implementer on the design. If the
recorded trigger makes that unsafe, stop and ask the user for the architectural
decision.

Implementers read the design and their own task file only, never sibling files.
You read a task's `## Record` only when it goes `needs-attention`.

## Splitting one issue

Subtasks are the plan's tasks in plan order. Without a plan, split into two to
five independently testable subtasks, write the mini-specs to
`plan/<unit>/subtasks.md`, and give that split the same single plan review.
Each subtask is its own unit in `budget.md`; the issue's final review is the
issue unit's review #1.

| Subtasks                                           | Topology                                     |
| -------------------------------------------------- | -------------------------------------------- |
| Clearly disjoint: no shared files, separate layers | Parallel worktrees and an integration branch |
| Overlapping, dependent, or unsure                  | Stacked relay — the default                  |

### Stacked relay

1. Subtask 1 owns the issue branch, cut from the base.
2. When subtask N's implementer settles with commits, record N's HEAD as N+1's
   `start-sha` and cut N+1's worktree from N's branch with
   `ORCA worktree create --name <unit>-<n> --parent-worktree active --base-branch <branch-of-n> --json`.
   N+1's spec says commits before `start-sha` belong to an earlier subtask under
   review: context, not scope.
3. N is reviewed and fixed while N+1 implements. **At most two subtasks run ahead
   of the last clean one**; N+3 waits until N is clean.
4. N+1's review starts only when N is clean and N+1's implementer has merged N's
   final HEAD, rerun focused tests and build, and committed. Update its
   `start-sha` to N's final HEAD.
5. Every review of subtask N is scoped to `git diff <start-sha>...HEAD`: pass the
   base ref as `<start-sha>`, never the base branch.
6. Moving the issue branch forward and removing finished subtask worktrees is
   dispatched work, given as an exact list.

### Parallel worktrees and an integration branch

1. Cut the integration worktree on the issue branch from the resolved base sha,
   then each subtask's worktree from the integration branch.
2. Run implement, review, and fix per subtask.
3. A dispatched merge worker merges each clean subtask into the integration
   branch. On conflict, it preserves both sides' intent and runs the full suite;
   you never resolve conflicts by hand.
4. Merged subtask worktrees and branches go to a cleanup worker as an exact list.

### Final integration check

One worker in the issue worktree runs the build, the full suite, and an end-to-end
sanity pass on the combined result, fixing only trivial breakage. Non-trivial
breakage is findings: a counted fix on the issue unit. Then, for a relay, one
fresh full-issue review with every subtask spec as its spec and the whole branch
as its scope. A parallel topology already reviewed each branch in full; skip this
review unless the merges were conflict-heavy. Land once, from the issue worktree.
