---
name: debug
description: >-
  Systematic root-cause debugging for a bug, a failing test, or any unexpected
  behavior: read the real error, reproduce it, find the first boundary where the
  value is already wrong, compare against a working case, and test one
  falsifiable hypothesis at a time. Stops hard after three failed fixes to
  question the architecture instead of attempting a fourth. Use as soon as
  something breaks and before proposing or applying any fix. This is not a
  review skill and not an evidence gate: use `review` to look for defects in a
  diff that is not misbehaving, `tdd` to write the reproduction test, and
  `verify` to back the claim that the bug is fixed.
---

# Debug

Debugging is investigation before repair. It produces a stated cause, a test
that reproduces it, and a fix whose effect you can explain.

`ORCA` below is a placeholder for the executable you resolved in the stub;
substitute it before running and do not create a shell variable.

## Outcome

**Result:** one written root cause, a failing test that reproduces it, and a fix
that makes that test pass. **Next consumer:** whoever asked for the bug to be
fixed, and the next reader of the regression test. **Done:** the cause is
stated in a sentence a colleague could check, the reproduction fails before the
fix and passes after it, and the full suite is no worse than the recorded
baseline.

**Safe failure:** stop with the investigation written down. An undiagnosed
symptom that stopped appearing is not a fixed bug, and "it works now, I don't
know why" is a checkpoint, not a result.

## Iron law

**No fix without a root cause you can state first.** A fix applied before you
can say *why* the bug happens is a guess, and a guess that makes the symptom
disappear is the expensive kind — it survives review, ships, and comes back.

## 1. Investigate

1. **Read the actual error.** The whole message, the whole stack, the whole
   failing assertion — not your summary of it. Quote the line that failed.
2. **Reproduce it.** Find the smallest command that shows the failure reliably:
   one test, one request, one CLI invocation. Record the reproduction rate. An
   intermittent bug and a deterministic one need different hunts, and a fix for
   an intermittent failure you never reproduced is hoped for, not verified.
3. **Check what changed.** The log, the diff, and the dependency lockfile. A bug
   that appeared today usually has a commit behind it; a bisect earns its cost
   once the suspect range is more than a handful. In a folder workspace with no
   version control, this step is the file timestamps and the deploy history
   instead — it is never a reason to stop, and never a reason to require Git.
4. **Instrument the boundaries.** Inspect the values crossing each boundary
   between the input and the symptom — function entry and exit, a process or
   network hop, a read or write of shared state — and find the **first**
   boundary where the value is already wrong. That boundary, not the crash site,
   is where the bug lives. A null dereferenced deep in a call stack usually
   became null many calls earlier.

## 2. Compare against a working case

Find a case that **works**: a sibling call site, an analogous handler, the same
function on different input, the same code before the breaking change. Diff the
working case against the broken one and list every difference — configuration,
input shape, call order, environment, host. The cause is almost always in that
list, and the list narrows the search far faster than rereading the broken path.

## 3. One hypothesis at a time

State the hypothesis as a falsifiable sentence — "X is null at Y because Z never
runs when W" — not a hunch like "something is off with the config". Design the
**smallest** experiment that would come out differently depending on which
hypothesis is true.

**Change one variable per attempt.** Editing the retry logic and the timeout in
the same pass means a green result confirms neither. Write down each result
before the next attempt; "I tried a few things" is how the same attempt gets
made twice.

## 4. Fix, test first

Write the failing test that reproduces the bug **before** the fix, apply the
fix, watch the test go green, then run the full suite against the baseline you
recorded. Load the `tdd` skill for the red/green cycle, and the `verify` skill
before claiming the bug is resolved. A fix that only makes the reproduction pass,
with no test locking the behavior in, regresses the next time anyone touches that
code.

## Three-failed-fixes circuit breaker

**After the third failed fix attempt, stop. Do not attempt a fourth.** Three
failures mean the model of the system is wrong, not that the fix was slightly
off. Write down what you believed, what you tried, and what actually happened
each time. Then question the architecture — is the component in the wrong place,
is the invariant unenforceable, is this a symptom of a design problem — and take
that question to the user before attempt four.

When the work is running under a coordinator, the circuit breaker is an
escalation, not a silent pause: report the three attempts and the architectural
question through the `orchestration` skill's escalation path rather than
continuing to spend attempts.

## Evidence boundary

The execution host owns every process, filesystem, and transcript fact about a
failure. A log you did not read on that host is not evidence about it, and a
remote process you cannot reach is `unverifiable`, never `exited` — contact loss
is not process death, and it is not a diagnosis either.

## Red flags

| Thought                                          | Reality                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| "Let me just try changing this"                  | That is a guess, not a hypothesis. Name what you expect and why first.           |
| "It's probably a race, let me add a sleep"       | A sleep hides the race. Find the actual ordering dependency.                     |
| "I'll add a null check and move on"              | The null should not be there. A guard moves the symptom downstream.              |
| "It works now, I don't know why"                 | Unexplained fixes regress. No stated cause means no root cause.                  |
| "The test is flaky, let me retry it"             | Flaky is a bug report. Retrying discards the evidence.                           |
| "Let me rewrite this function"                   | A rewrite without a diagnosed cause relocates the bug.                           |

## Hands off to

- `tdd` — write the reproduction test before the fix.
- `verify` — back the claim that the bug is fixed with fresh command output.
- `review` — when the question is "what else is wrong here", not "why does this break".
