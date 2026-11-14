# Task pipeline

Load this reference when running a task's implement, review, fix, PR, or CI
stage.

## Verification

The manifest's verification contract names the commands. Two rules keep their
results trustworthy:

- **One full suite per worktree and revision.** The implementer runs it before
  reporting; review #1 reruns it once, after the implementer settles, because
  the reviewer's run is the independent one. Everyone else reuses that result
  and runs focused checks. A result is reusable only for the same revision, a
  clean tree, and the same environment.
- **A command is finished when its process exits,** not when a wrapper returns
  or a pane goes idle. Keep the command, its exit code and its log.

An approved task includes ordinary reversible verification in its own worktree:
focused checks, fixtures, local builds. Shared-service mutation, deployment, new
cost and wider credentials still need the user.

Reuse an idle simulator, browser session or app instance when its state suits
the check, by explicit device or instance target. Start a fresh one only when
the check needs its own mutable state.

## Launching a stage agent

| Action                          | Claude Code                                                                 | Codex                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Start                           | `Agent`, background, the role's `model` alias, prompt = the saved spec text | `collaboration.spawn_agent` (`task_name`, `message`, `fork_turns: "none"`, `model`, `reasoning_effort`) |
| Continue (fix round, follow-up) | `SendMessage` to the agent id                                               | `collaboration.followup_task` (`target`, `message`)                                                     |
| Settle                          | the completion or idle notification carrying the report                     | the agent's final message, announced through `collaboration.wait_agent`                                 |
| Stop                            | `TaskStop`                                                                  | `collaboration.interrupt_agent` (`target`)                                                              |

In Claude Code the agent type is `delivery-implementer` for implement, fix and
merge stages and `delivery-reviewer` for reviews when those are listed, else
general-purpose. A Claude model id maps to its alias (`claude-opus-*` → `opus`,
`claude-sonnet-*` → `sonnet`, `claude-haiku-*` → `haiku`, `claude-fable-*` →
`fable`). Codex applies a model override only with `fork_turns: "none"`.

A cross-engine review is an Orca worker (load `orchestration` first):

```text
ORCA orchestration worker-start --spec "<review spec>" --worktree id:<repoId>::<worktreePath> --agent <other engine> [--model <m>] [--effort <e>] --json
```

Orca wakes you with its `worker_done`; the worker closes on its own afterwards.

### Roles and strength

| Stage                                             | Role in `agent-roles.json` |
| ------------------------------------------------- | -------------------------- |
| Planner                                           | `planner`                  |
| Implementer or fixer                              | `implementer`              |
| Implementer or fixer of a user-visible surface    | `ui`                       |
| Task, plan, integration, or merge-conflict review | `reviewer`                 |
| Bounded extraction you can check at a glance      | `inspector`                |

Use the role's first candidate, and its `strong` override for: a planner, a plan
review, review #1, review #3, an integration review, and an implementer working
from a design with no task file. Use `inspector` only for extraction (a red CI
log, check status, an issue-body classification), never to implement or review.

Two escalations, each for the rest of the unit:

- A later review finds a new defect in code an earlier review passed: every
  later review runs strong.
- An implementer below strong still draws `fix-needed` at review #2: fix #2 goes
  to a fresh strong agent in the same worktree, told to read `git log` and the
  branch diff first.

## 1. Implement

Create one worktree per task, nested under the coordinator's so the run reads as
one tree, cut from the base branch (or from the predecessor's branch for a
stacked unit):

```text
ORCA worktree create --name <task-slug> --parent-worktree active --base-branch <base> --json
```

Record its path, branch, head and base sha in the unit row before the
implementer starts. Then launch the implementer with the saved spec. The spec
states the binding rules itself; a path in it is for checking a detail.

## 2. Review

Launch a fresh reviewer in the same worktree once the implementer settles, after
`ledger-reserve`. The reviewer runs the `review` skill's layers as its own
parallel subagents, with the adversarial layer given the diff only. It writes
its findings file in the run directory and reports the part from
`## Merged findings` down.

A review is read-only: no edits, commits, stash, checkout, reset or branch
switch, because a reviewer has swept a sibling's work away with one stash. If a
proof needs a mutation, the reviewer must be the only session in that worktree,
and the spec says both in one sentence.

Settle with `ledger-settle --findings <file>`. On `invalid`, send the reviewer
the printed problems once and settle again after it corrects the file.

Rounds after the first are full-branch rounds with the prior findings attached:
the diff since the previous reviewed sha is the focus, the diff since the base
(or `start-sha`) is the scope. An unfixed prior finding is listed again under
its original ID; a resolved one is not re-raised; a `disputed` or `blocked` one
stays reviewable.

### UI evidence

For a change a user can see, the implementer captures each before/after pair at
the same route, viewport and state into `orchestrate/<unit>/before-<what>.png`
and `after-<what>.png`, the before from the base revision, with one describing
line each. Capture pages with `ORCA screenshot --worktree <selector> --json`;
for another surface use the repository's own capture path without stealing
focus. The reviewer reproduces each user-visible criterion itself, saves
`<findings-file>.seen-<what>.png`, and prints
`Seen: <criterion> - <what the screen showed>`. A criterion it could not
exercise is a `decision-needed` finding. Captures go in the PR body only where
the repository asks for visual proof.

**Blind A/B judge (optional, visual changes).** A cheap agent copies each pair to
`orchestrate/<unit>/ab/<what>/A.png` and `B.png` in random order and keeps the
key; a judge given only that directory prints one `AB_VERDICT:` line per pair;
the first agent decodes them into
`AB_SUMMARY: pairs=<n> regressions=<n> unchanged=<n>`. A regression at `med` or
`high` confidence, or `unchanged` on a unit whose point was a visible change, is
a `major` finding for the next fix round.

## 3. Fix

- `clean` from any round ends the loop: every round certifies the whole branch.
  Its `nit` and `defer` items are listed, not looped on.
- `fix-needed`: ordinary defects go back to the implementer as a fix round
  carrying the merged findings (its `patch` and `nit` items) and nothing else.
  Product or scope decisions go to the user and the unit waits. `defer` items
  are recorded and named in the closing report.
- You decide severity. Raise a finding that damages existing data to major;
  lowering one needs a one-line reason in the closing report.
- Continue the implementer's own agent for the fix (it knows why the code has
  its shape), unless an escalation above applies or the agent is gone; then
  start a fresh one told to read `git log` and the branch diff first.
- The fixer writes `orchestrate/<unit>/fix-<f>.dispositions.md` under
  `## Dispositions`, one line per `patch` and `nit`:

  ```text
  R1.2 - fixed - <sha> - swept <a>/<k>[ - <why a<k>]
  R1.3 - disputed - <reason> - evidence: <cmd=`…` exit=<n> | quoted code>
  R1.5 - blocked - <environment or authority reason>
  R1.6 - nit-fixed - <sha>
  R1.7 - nit-skipped - <reason>
  ```

  The next review rules on each `disputed` line. A finding upheld and disputed
  again is a `## Decisions` row (`fix as reviewer says` / `accept dispute` /
  `park unit`) and spends no round.

- Scope a late round mentions beyond the task gets a one-line disposition and
  stays out of the branch.

## 4. PR

The implementer fetches and merges the current base, resolves conflicts keeping
both sides' intent, fixes the last review's nits in one `nit-fix` commit limited
to the lines they name (writing `orchestrate/<unit>/nit-fix.dispositions.md`),
reruns the full suite and the build checks, commits and pushes. A nit whose fix
would change logic becomes a known-issues row instead.

```bash
gh pr create --repo <owner>/<repo> --base <base-branch> --head <branch> --title "<title>" --body-file <path>
```

Name `--repo`, `--base` and `--head` every time: on a fork `gh` otherwise stops
to ask, which hangs a stage agent. Load `pr-author` for the body. It carries no
run-directory paths and no orchestration detail. A GitLab project uses `glab`; a
repository that prescribes direct merges uses that instead.

**Primary checkout guard.** Before a merge or deploy stage starts and after it
settles, record in the unit's directory:

```text
git -C <primary> rev-parse HEAD
git -C <primary> symbolic-ref -q --short HEAD
git -C <primary> status --porcelain
```

A HEAD advance with the same branch and status, where
`git -C <primary> merge-base --is-ancestor <before> <after>` succeeds, is someone
else's routine commit: note it and continue. For any other difference, stop
dispatching and tell the user what moved; do not repair it.

## 5. Green CI

Launch a cheap background agent per open PR to run
`gh pr checks <n> --repo <owner>/<repo> --watch` and report the deciding line,
pulling a failing log into the unit's directory. Meanwhile continue with other
units.

After a direct merge or another endgame with no PR, the agent watches the target
branch's run at the landed sha instead:
`gh run list --repo <owner>/<repo> --commit <sha>`, then
`gh run watch <run-id> --repo <owner>/<repo> --exit-status`. Either way it is one
blocking command under the agent's own timeout, not a sleep or poll loop; on
timeout the agent reports the checks unfinished.

A mechanical fix pushes directly. A logic fix is `ledger-reserve --kind fix
--reason "ci:<check>"`, then one `review-round` on the new commits. When a
sibling PR from this run merges, re-sync every open PR that sits on the same
base (`## Keep units moving` in the main guide).
