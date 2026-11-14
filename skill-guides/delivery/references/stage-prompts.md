# Stage prompts

Load this reference when writing the spec for a delivery stage, or when checking
a stage report before accepting it.

## Before every dispatch

1. Save the spec as `orchestrate/<unit>/<stage>-<n>.md` in the run directory.
2. Fill every field its stage row names; leave no `<...>` placeholder or `TBD`.
3. For a review or fix, run `ledger-reserve` first.
4. State binding rules in the spec. A path is for checking a detail, not a
   reading list.

Keep a spec to about 6,000 characters: scope, invariants, required checks,
baseline failures and evidence pointers, without coordinator history or raw
output. Go over when a binding rule or mandated evidence needs the room.

## Shared clauses

The `delivery-implementer` and `delivery-reviewer` agent definitions already
contain these. A stage launched any other way (a general-purpose subagent, a
Codex subagent, an Orca worker) gets the clauses its stage row names written
into its spec.

| Clause    | Content                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execution | This is approved work: build the spec without redesigning it or waiting for approval. If the spec is wrong, say so in one line and stop. Start no review loop and no other agents.                                                                                                                                                                                                                    |
| Change    | Before editing, list in the task file's `## Record` every place the change must reach: callers, tests, fixtures, config, exports. Prefer code already in the repository, then the platform, then an installed dependency, then the minimum new code. Add no option or abstraction the spec does not ask for; report what seems missing in one line. Keep validation and error handling on moved code. |
| Commands  | Keep each command's exit code and log. Run a long command and wait for it in the same turn (the tool's timeout, or background mode plus its exit notification); do not end your turn while your own command runs, because nothing wakes you when it exits. Do not start a second full suite for a worktree and revision that already has one running or finished.                                     |
| Read-only | Make no edit, commit, stash, checkout, restore, reset, clean or branch switch; a dirty or wrong tree is a finding. You may write the findings file, its `.suite.log`, and your `.seen-<what>.png` captures in the run directory.                                                                                                                                                                      |
| Report    | At most 120 words, or 200 for an escalation. Logs and diffs stay in files under `orchestrate/<unit>/`; name the path and the deciding line. Mandated verbatim evidence is exempt.                                                                                                                                                                                                                     |
| Subagent  | First command: `cd <abs worktree> && git rev-parse --show-toplevel`; stop with `BLOCKED` if it prints another path. The shell's directory resets on every call, so prefix commands with `cd <abs worktree> &&` and give file tools absolute paths. Do not run `orca orchestration` commands: you would act under the coordinator's identity.                                                          |
| Hygiene   | Plans, task files, captures and logs live in the root worktree's run directory and stay out of the worktree, commits, and PRs.                                                                                                                                                                                                                                                                        |

## File names

Under the run directory: `orchestrate/<unit>/review-<r>.findings.md` (`<r>` is
the review number, `I` for an integration review),
`orchestrate/<unit>/fix-<f>.dispositions.md`, and
`orchestrate/<unit>/nit-fix.dispositions.md`. The ledger and metrics commands
read these names.

## Per-stage contract

| Stage         | Spec fields                                                                                                                                                                                     | Clauses                                      | Report must paste                                                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implement     | Unit, worktree, branch, base sha (and `start-sha` when stacked), distilled spec, task-file path, verification contract, the manifest's hazards, capture dir for UI work                         | Execution, Change, Commands, Report, Hygiene | Baseline failures or `baseline: none`; `Checked:` lines with cmd and exit for full suite, lint, format, build; commit shas; `Not checked: <what and why>` or `none`; `git status --porcelain`; UI capture paths |
| Fix           | Unit, fix number, the `## Merged findings` section only, focused-test command, task-file path                                                                                                   | Execution, Change, Commands, Report          | `git status --porcelain`; each commit's sha and `git show --stat`; per finding, the fixing hunk or `not fixed: <why>`; the dispositions file path; `Not checked:` line                                          |
| Review full   | Unit, worktree, base ref, reviewed sha, distilled spec, baseline, suite log path, findings path, UI criteria to see; the implementer's `Not checked:` line, for the non-adversarial layers only | Read-only, Commands, Report                  | Merged findings; `Seen:` lines; `Checked: tests full cmd=<cmd> exit=<n> duration=<s>`; `git status --porcelain`; the verdict line                                                                               |
| Review round  | Review-full fields plus previous findings, previous reviewed sha as focus, base ref as scope, focused-test command, and the latest fix's dispositions file for the non-adversarial layers       | Read-only, Commands, Report                  | Review-full evidence plus `Checked: tests focused cmd=<cmd> exit=<n> duration=<s>` and each previous finding marked fixed or still open                                                                         |
| Re-sync       | Unit, worktree, the branch and sha to merge, focused-test and build commands                                                                                                                    | Execution, Commands, Report                  | The merge commit sha; conflicts and how each resolved; `Checked:` lines; `git status --porcelain`                                                                                                               |
| Plan          | Design path, task directory, recorded planning trigger                                                                                                                                          | Execution, Report, Hygiene                   | Plan and task-file paths; the planner worktree's `git status --porcelain`, which must be empty                                                                                                                  |
| Plan review   | Plan path, design path, the review scope in `planning-and-splitting.md`                                                                                                                         | Read-only, Report                            | Merged findings and the verdict line                                                                                                                                                                            |
| Verify arm    | Arm id, its one question, authorized commands, artifact path, schema file, deciding fields, freshness cutoff                                                                                    | Execution, Commands, Report                  | Artifact path and its completion field; per command, exit code and timestamps                                                                                                                                   |
| Cleanup       | Repository root, exact candidate list, base ref after fetch, result path                                                                                                                        | Execution, Commands, Report                  | Per candidate, `removed` or `refused` with the deciding evidence                                                                                                                                                |
| Retrospective | Run directory, retrospective path, prior retrospective paths, the filing rules in `parking-and-reporting.md`                                                                                    | Execution, Report                            | The path, one line per section, and one `ISSUE: <url> filed\|commented` or `unfiled: <error>` line per Orca entry                                                                                               |
| A/B judge     | Pairs directory and verdict path only                                                                                                                                                           | Read-only                                    | One `AB_VERDICT: pair=<dir> prefer=<A\|B\|neither> confidence=<low\|med\|high> reason=<line>` per pair                                                                                                          |

A subagent's spec also carries `Subagent`.

## Stage notes

**Implement.** In order: install from the frozen lockfile; run the contract's
baseline once and record only failures that matter to this task; write the reach
list; implement under `tdd`; rerun the full suite, lint, format and build; drive
the real surface end to end where one exists; commit with explicit paths, without
pushing. Append commits, touched files and concerns to the task file's
`## Record`.

**Fix.** Fix every `patch` and `nit`, or dispute a wrong one with evidence, and
write one disposition line each. Leave `decision-needed` and `defer` items alone
and say so. Run the focused tests plus lint, format and build; the next reviewer
owns the full suite. Show the fixing hunk for each finding.

**Review.** Review #1 starts the full suite once in the background and reviews
while it runs; later rounds reuse a result for the same revision or run it when
none exists. Run the `review` skill's layers in parallel, the adversarial layer
with the diff only. Write the findings file in this order: each layer's raw
findings, a line reading exactly `## Merged findings`, the merged list, `Prior:`
lines, `Seen:` lines, `Checked:` lines, the verdict line. Report everything you
find and let the buckets grade it; do not drop a finding because it seems small.
Only failures new against the recorded baseline are findings. A full-suite
failure outside the baseline is rerun once alone; it is a `load-flake` only when
it passes alone and its code path does not reach a changed file, and the findings
file says why.

**Verify arm.** Write the artifact beside its final path, set its completion
field when measurement is complete, then publish with one atomic rename. Keep
the first failure's command, exit and evidence; rerun at most once without
overwriting it.

**Plan.** Write only under the task directory in the run directory and leave the
planner worktree clean.
