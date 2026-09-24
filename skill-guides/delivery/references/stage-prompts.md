# Stage prompts

Load this reference when writing the Task spec for any delivery stage, or when
checking a stage report before accepting it. The orchestration fields — Target,
Change, Constraints, Ownership, Observable acceptance — still frame every spec;
this document fixes what each stage puts in them and what its report pastes back.

## Before every dispatch

1. Save the spec as `orchestrate/<unit>/<stage>-<n>.md` in the run directory.
2. Confirm every field its stage row names is filled, and no `<...>` placeholder
   from this reference or `TBD` remains.
3. For a review or fix, confirm its `budget.md` row exists and passes the
   kernel's refusal checks.
4. Restate binding rules inline. A path is backup for checking a detail, never a
   reading list the worker must finish before it can start.

## Shared clauses

Each stage row names the clauses its spec carries, in substance if not verbatim.

| Clause            | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execution         | This is execution of approved work. Do not brainstorm, redesign, propose alternatives, or wait for design approval; the spec is the contract. If the spec is wrong, say so in one line in the report and stop. Do not start your own review loop or other workers.                                                                                                                                                                                                                                                         |
| Command execution | Keep every command's handle, exit code, and output. A wrapper returning is not its subprocess exiting: poll the handle to exit or deadline, and on deadline report the handle unfinished. Never start a duplicate while one runs — above all a second full suite for the same worktree and revision. Only the suite owner in the verification contract runs the full suite; others reuse its result and run focused checks. A focused command that selects the whole suite is a command problem, not permission to run it. |
| Read-only         | No edit, commit, stash, checkout, restore, reset, clean, or branch switch; a dirty or wrong tree is a finding, never something to tidy. Permitted writes: the findings file, its `.suite.log`, and your own `.seen-<what>.png` captures, all in the run directory. Write authority exists only with sole occupancy stated in the same sentence; a spec granting one without the other is malformed — say so and stay read-only.                                                                                            |
| Report            | A routine report is at most 120 words, an escalation at most 200. Logs, diffs, and raw output stay in files under `orchestrate/<unit>/`; the report names the path and the deciding line. Mandated verbatim evidence overrides the cap.                                                                                                                                                                                                                                                                                    |
| Run hygiene       | Plans, task files, captures, and logs live in the root worktree's run directory. Never copy them into the worktree, stage them, or name them in a commit, PR, or MR.                                                                                                                                                                                                                                                                                                                                                       |

## Per-stage contract

| Stage           | Required spec fields                                                                                                                                                   | Clauses                             | Report must paste                                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implement       | Unit, worktree id, branch, base sha, distilled spec, task-file path and its `## Record`, verification contract, `environment-hazards.md` path, capture dir for UI work | Execution, Command, Report, Hygiene | Baseline failures or `baseline: none`; `Checked:` lines with cmd and exit for full suite, lint, format, build; commit shas; `git status --porcelain`; UI capture paths, one described line each |
| Fix             | Unit, fix number, the `## Merged findings` section only, focused-test command, originating review row                                                                  | Execution, Command, Report          | `git status --porcelain`; `git diff HEAD --stat`; each commit's sha and `git show --stat <sha>`; per finding, the fixing hunk or `not fixed: <why>`                                             |
| Review full     | Unit, worktree, base ref, reviewed sha, distilled spec, baseline, suite owner and log path, findings path, UI acceptance criteria to see                               | Read-only, Command, Report          | Merged findings; `Seen:` lines; `Checked: tests full cmd=<cmd> exit=<n> duration=<s>`; `git status --porcelain`; the verdict line                                                               |
| Review round    | Review-full fields plus previous findings, previous reviewed sha as focus, base ref as scope, focused-test command; an integration review adds its material reason     | Read-only, Command, Report          | Review-full evidence plus `Checked: tests focused cmd=<cmd> exit=<n> duration=<s>` and each previous finding marked fixed or still open                                                         |
| Plan            | Design path, task directory, recorded planning trigger                                                                                                                 | Execution, Report, Hygiene          | Plan and task-file paths; the planner worktree's `git status --porcelain`, which must be empty                                                                                                  |
| Plan review     | Plan path, design path, the review scope in `planning-and-splitting.md`                                                                                                | Read-only, Report                   | Merged findings and the verdict line                                                                                                                                                            |
| Verify arm      | Arm id, its one question, authorized commands, artifact path, schema file, deciding fields, freshness cutoff                                                           | Execution, Command, Report          | Artifact path and its completion field; per command, exit code and timestamps                                                                                                                   |
| Cleanup execute | Repository root, exact candidate list, base ref after fetch, result path                                                                                               | Execution, Command, Report          | Per candidate, `removed` or `refused` with the deciding evidence                                                                                                                                |
| Teardown verify | The checks in `parking-and-reporting.md`, worktree table, run id, verdict path                                                                                         | Read-only, Command                  | Each check's command and output, then `VERDICT: clean` or `VERDICT: residue`                                                                                                                    |
| Retrospective   | Run directory, retrospective path, prior retrospective paths                                                                                                           | Execution, Report                   | The path and one line per section                                                                                                                                                               |
| A/B judge       | Pairs directory and verdict path only                                                                                                                                  | Read-only                           | One `AB_VERDICT: pair=<dir> prefer=<A\|B\|neither> confidence=<low\|med\|high> reason=<line>` per pair                                                                                          |

## Stage notes

**Implement.** In order: install from the frozen lockfile; run the contract's
baseline once before touching anything and record only task-specific deltas;
implement under `tdd`; rerun the full suite and the repository's lint, format,
and build checks; drive the real surface end to end in an isolated browser or
app instance; for UI work capture the before/after pairs described in
`task-pipeline.md`; commit with explicit paths, never `git add -A`, and do not
push. Append commits, touched files, and concerns to the task file's
`## Record (append-only)` at its absolute path.

**Fix.** The message carries only what changed: the findings. Fix every `patch`
item; leave `decision-needed` and `defer` items alone and say so. Run the
focused tests plus lint, format, and build — the next reviewer owns the full
suite. Never assert a finding fixed; show the hunk.

**Review.** Resolve suite ownership first: the owner starts the suite once in the
background with a deadline and reviews while it runs; everyone else reuses the
owner's result for the same revision and environment. Run the `review` skill's
layers in parallel, with the adversarial layer spec-blind — it receives the diff
only. Thread spec compliance into the other layers. Write the findings file in
this order: every layer's raw findings, a line reading exactly
`## Merged findings`, the merged list, `Seen:` and `Scored:` lines, `Checked:`
lines, the verdict line. Report only what follows the anchor. Claims about the
tree are pasted `git status --porcelain` output, never characterized. Only
failures new against the recorded baseline are findings.

A later round verifies each previous finding first — an unfixed one is a new
finding — then takes the diff since the previous reviewed sha as focus and the
diff since the base ref as scope, and never re-raises an item already
dispositioned.

**Verify arm.** Stage the artifact beside its final path, set its completion
field to true only when measurement is complete, then publish with one atomic
rename. That rename is producer completion; a path reported before it is not
ready. Keep the first failure's command, exit, and evidence, and rerun at most
once without overwriting it.

**Plan.** Write only under the task directory in the run directory; commit
nothing, implement nothing, and leave the planner worktree clean.
