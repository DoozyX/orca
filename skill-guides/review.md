---
name: review
description: >-
  Multi-layer code review of a diff, a branch, or a pull request: an adversarial
  pass starved of the author's intent, a mechanical edge-case path trace, and a
  verification-gap check, plus a deletion check when code was removed, merged
  into one deduplicated, severity-graded, triaged findings list ending in a
  machine-readable verdict. Use when the user asks to review changes, wants a
  second opinion before committing or merging, or when a dispatched reviewer is
  told to run the shared review layers. This is not a debugging skill and not an
  evidence gate: use `debug` when something is already misbehaving, `tdd` when
  the gap is a missing test, and `verify` to back a completion claim.
---

# Review

Three orthogonal layers run independently and merge into one findings list.
Layers beat one large pass because each has a different blind spot, and the
adversarial layer is deliberately starved of context so it cannot anchor on the
author's stated intent.

`ORCA` below is a placeholder for the executable you resolved in the stub;
substitute it before running and do not create a shell variable.

## Outcome

**Result:** one merged findings list, each item graded and triaged, ending in
exactly one verdict line. **Next consumer:** the author, or the coordinator
running a `delivery` pipeline, which branches on that verdict directly. **Done:**
every layer that was in scope has run, every finding has a severity and a bucket,
and the verdict line is present and literal.

**Safe failure:** report what was actually checked and what was not. A review
that could not run a layer says so in its `Checked:` lines rather than emitting a
clean verdict it did not earn.

## Classify the role

| Current context                                            | Role                | Route                                                                                                     |
| ---------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| The user asks to review a diff, branch, or pull request    | Reviewer            | Run the steps below and report the merged list                                                            |
| A live injected Task preamble dispatched you as a reviewer | Dispatched reviewer | Same steps; write the findings file the Task spec names, then report only the merged list and the verdict |
| You are coordinating a `delivery` pipeline                 | Coordinator         | Dispatch a fresh reviewer; do not review your own run's code                                              |
| The change is already misbehaving and the cause is unknown | Debugger            | Load `debug` first; review is not a diagnosis                                                             |

## Safety floor

- Review is **read-only**. No edits, no working-tree rewrites, no stash, no
  branch or index mutation. Tool restrictions block editing tools but leave a
  shell available, so this rule is what stops a destructive command, not the
  flags. A reviewer has swept a sibling's in-flight work with one stash in a
  shared worktree.
- Write authority is granted only together with sole occupancy of the worktree,
  and both must be stated in the same sentence. Prefer a static proof and take
  nothing.
- Folder workspaces are valid. Never require Git: when there is no diff to
  resolve, the target is the file set the user names and the layers read it
  directly.
- The execution host owns every process, filesystem, and transcript fact. A suite
  you did not see finish is `unverifiable`, not passing, and contact loss with a
  test run is not evidence that it failed.

## 1. Resolve the target

- No argument: the uncommitted working-tree changes, plus any untracked files the
  user names.
- A range, a branch, a pull request number, or an explicit file list: resolve it
  with the repository's own version-control or forge tooling, and prefer the
  merge-base form for a branch so the review does not re-litigate the base.
- An optional trailing "also consider ..." instruction is captured verbatim and
  appended to **every** layer as an extra concern. It never replaces a layer's own
  checklist.

State the target you resolved, in one line, before dispatching anything.

## 2. Scope the layers

| Diff contains                                                                                                                         | Layers                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Code                                                                                                                                  | `adversarial` + `edge-cases` + `verification-gap`                     |
| Code that also removes behavior (deleted functions, branches, guards, validation, cleanup, tests — not renames, moves, or formatting) | the three above plus `deletion-check`                                 |
| Documentation or configuration only                                                                                                   | `adversarial` alone, plus one line saying why the others were skipped |

## 3. Run the layers, preserving the asymmetry

Run each layer against the resolved target using its reference below. When the
session can dispatch parallel subagents, give each one its own layer and its own
inputs, all dispatched in one message so they run concurrently. Otherwise run
them in order: adversarial, edge-cases, verification-gap, deletion-check.

| Layer              | Gets                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `adversarial`      | the diff **only** — no spec, no conversation, no repository access, plus the principle lenses |
| `edge-cases`       | the diff, the full post-change content of touched files, and repository read access           |
| `verification-gap` | the same                                                                                      |
| `deletion-check`   | the same                                                                                      |

**The asymmetry is a rule, not a preference.** Denying the adversarial layer the
author's intent is what kills anchoring bias; denying the tracing layers
repository access would manufacture false positives. Running the layers in one
context has no separate contexts to enforce it, so the asymmetry is honored by
**ordering**: run adversarial first, before reading the spec or any repository
file. Once the spec is in context it cannot be taken back out, and every later
adversarial judgement is anchored. A caller that hands you a spec up front — a
dispatched reviewer's Task spec is the usual source — does not override this.

## 4. Merge and deduplicate

Two findings merge when they are at the same location **and** describe the same
underlying issue. Keep the more detailed description and union the provenance
tags, spelled exactly `[Adversarial]`, `[Edge]`, `[V-Gap]`, `[Deletion]`.
Assign severity here and only here; the layers were forbidden to grade because
each had partial information by design.

- `critical` — data loss, corruption, security exposure, or a break in behavior
  that shipped and is in use.
- `major` — wrong behavior on a reachable path, or a missing guard a real input hits.
- `minor` — everything else worth saying.

Sort by severity, then by how many layers flagged the finding: multi-layer
agreement is a free confidence signal. A finding whose blast radius is existing
data, introduced by this change, is never `minor`.

## 5. Rewrite the tone, then triage

The adversarial layer's output is hostile on purpose. Rewrite each finding as an
observation plus a concrete fix — what is true about the code, and the specific
change that resolves it — and drop every adjective about the author.

```text
Before: This is a lazy, broken null check that will blow up in prod.
After:  `user.email` is read without a null check; a signed-out user crashes the
        handler. Return early when `user` is null, before the read.
```

Every merged finding gets exactly one bucket: `patch` (mechanical and in scope,
fix it now), `decision-needed` (a scope question, a product decision, or a
trade-off the spec does not settle), or `defer` (pre-existing or out of scope,
never extending a fix loop). Inside a run, append each `defer` item to the root
worktree's `.orca/<run>/orchestrate/deferred.md`; otherwise list them under a
`## Deferred` heading in the review output.

## 6. Output format

```text
N. <file>:<line> - <critical|major|minor> - [<patch|decision-needed|defer>] - <provenance> - <observation and concrete fix>
```

Then two or three lines starting with `Checked:` naming what was actually
verified: which layers ran, what the suite did if it ran, and what was skipped and
why. Then exactly one verdict line, last:

```text
VERDICT: clean
VERDICT: fix-needed patch=<n> decision-needed=<n> defer=<n>
```

`VERDICT: clean` is emitted if and only if there are no `patch` and no
`decision-needed` findings; `defer` items may exist and are still listed above it.
The clean verdict is a mandated exact line — never an empty response, never "looks
good to me", never silence. Counts are real counts, not estimates.

## Conditional references

Run `ORCA skills get review --reference references/<file>.md` at the gate below
and read only that document; `--references` lists the names. If the CLI rejects
`--reference`, run `ORCA skills get review --full` once and read only the named
reference. If it rejects `--full` too, keep this kernel's safety floor and use
that command's `--help`; never guess newer flags.

| Action gate                                                                      | Bundled reference                |
| -------------------------------------------------------------------------------- | -------------------------------- |
| Running the hostile, diff-only pass                                              | `references/adversarial.md`      |
| Enumerating reachable states the change does not handle                          | `references/edge-cases.md`       |
| Measuring whether the changed behavior is protected by a test                    | `references/verification-gap.md` |
| The change removes behavior and you need to know what was silently lost          | `references/deletion-check.md`   |
| Naming a design problem with the shared lenses, here or in `tdd`'s refactor step | `references/principles.md`       |

## Hands off to

- `debug` — when a finding is a live failure whose cause is unknown.
- `tdd` — when the fix needs a failing test in front of it.
- `verify` — before reporting the review, or the fix, as complete.
