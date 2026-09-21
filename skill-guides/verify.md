---
name: verify
description: >-
  The evidence gate before any completion claim: every "it works", "tests pass",
  "fixed", or "done" must be backed by a command run in the same message with its
  output shown, checked against the request as it was actually stated rather than
  as you remember it. Use before committing, opening a pull request, reporting a
  task complete, or telling anyone something is working. This is not a testing
  skill and not a review skill: use `tdd` to write the tests, `review` to look
  for defects, and `debug` to find a cause when the evidence comes back red.
---

# Verify

Verification is the last thing that happens before a claim, and it is the claim's
only justification. It costs one command.

`ORCA` below is a placeholder for the executable you resolved in the stub;
substitute it before running and do not create a shell variable.

## Outcome

**Result:** every completion claim in the message carries the command that proves
it and the decisive lines of that command's output. **Next consumer:** whoever
acts on the claim — the user, a reviewer, or a coordinator settling a Task.
**Done:** each stated criterion is either mapped to the command that proves it or
named explicitly as a gap.

**Safe failure:** say what is unverified and why. An honest unverified is a
result; a claim dressed as verified is not.

## Iron law

**No completion claim without fresh evidence in this message.** Evidence from
three messages ago is a memory, not a verification — the tree has changed since.
Run the command now, show the output, then make the claim.

## Claim to evidence

| Claim                                     | Evidence required                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| "tests pass"                              | The suite run **now**, showing zero failures. A subset run proves the subset only; say which you ran.                |
| "build works"                             | The build command exiting zero. A passing linter is not a build, and a type check is not a build.                    |
| "the bug is fixed"                        | The **original symptom** re-tested by the original reproduction, now absent.                                         |
| "I added a regression test"               | A verified red-green cycle: revert the fix, the test fails, restore the fix, the test passes. Show both runs.        |
| "the worker finished the work"            | The diff itself, never the worker's own success report. An agent reporting success is a claim, not evidence.         |
| "nothing else broke"                      | The full suite compared against a baseline recorded before the change.                                               |
| "it's deployed and running"               | A request against the running thing, with its response.                                                              |
| "the type checker is happy"               | The type-check command run now, exit zero — distinct from the tests and from the build.                              |
| "the migration is safe"                   | A run against a copy of real or representative data, not the migration applying cleanly to an empty schema.          |
| "the feature is done" / "matches the design" | The acceptance criteria and testing decisions **re-read now**, each one quoted and mapped to a command or named as a gap. |

## How to show evidence

Paste the command and the decisive lines of its output: the failure count, the
exit status, the assertion. Not the whole log. When the output is large, show the
tail and say what you filtered — "last fifteen lines of four hundred; no other
failures in the full log".

## Baselines

Before touching anything, record what already fails: run the suite and note the
failing names or the count. Hold yourself accountable for **new** failures
against that record. A baseline claimed from memory is not a baseline; if you did
not run it before you changed anything, you do not have one, and every failure is
yours until proven otherwise.

## Check against what was asked, not only what you built

Evidence that a command passed is half a completion claim. The other half is what
was asked for, re-read at the moment you claim it, because the version in your
head drifts silently — a long session or a compaction is exactly when it drifts
most.

Read the source of truth again, in this order, using the first that exists:

1. **A supervised Task** — the Task spec's observable acceptance, and the design
   or goal file it names, read at its path. These are written to survive
   compaction precisely so this check still works in a session that lost the
   original conversation.
2. **A design or spec** named anywhere in the request — read it at its path.
3. **Neither** — the request as the user actually stated it. Most sessions are
   this case. Inventing a requirement to check against is worse than checking
   against the ask; do not go hunting for a design that was never written.

Then say, per criterion, which command proves it or that nothing does. A criterion
no command covers is a gap to name, not a box to tick. If the goal or design
**cannot be read**, that is itself the finding: say so and stop.

## Safety floor for evidence about other agents

- The execution host owns every process, filesystem, and transcript fact. A
  worker's own summary is a claim; its diff and its command output are evidence.
- Preserve the verdicts `live` / `unverifiable` / `exited` when reporting on
  another agent or terminal. Loss of contact is not process death, and
  `unverifiable` is never rounded down to "finished" or up to "still working".
- Folder workspaces are valid. Never require Git for evidence: when there is no
  diff to show, the evidence is the file content and the command output.

## Red flags

| Red flag                                                                | Why it is a tell                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| "should work" / "probably passes" / "seems fine"                        | Hedging means no command was run. A command either passed or it did not.                  |
| "Done!" before any output appears in the message                        | The claim was written before the evidence existed.                                        |
| Citing a run from earlier in the conversation as current                | The tree has changed since; stale evidence is not evidence.                               |
| Reporting a worker's summary as the result                              | Its success report is a claim, not a diff you checked.                                    |
| "The test file exists, so it's covered"                                 | A file existing proves nothing about whether it runs or passes.                           |
| Silence about a failed step, followed by a claim about the step after it | A skipped failure does not disappear; it invalidates everything downstream.                |

## When evidence cannot be gathered

Say so explicitly and name both the reason and the gap — "no browser is available
here, so the end-to-end path is unverified", "no access to the staging database,
so the migration is unverified against real data". Then stop claiming that part.

## Hands off to

- `debug` — when the evidence comes back red and the cause is unknown.
- `tdd` — when a criterion has no test to prove it.
- `review` — when the question is whether the change is correct, not whether it ran.
