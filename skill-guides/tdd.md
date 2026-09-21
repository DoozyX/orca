---
name: tdd
description: >-
  Red/green/refactor discipline for writing a feature or a fix: write the
  failing test first, run it and watch it fail for the right reason, write the
  minimum code to pass, then refactor while it is green. Covers the gate before
  writing a test, the gate before adding a mock, and the mutation check that
  proves the new test protects something. Use before writing production code for
  a new behavior or a fix, and when tests are being added after the fact. This is
  not a debugging skill and not an evidence gate: use `debug` to find a cause
  before there is a test to write, and `verify` before claiming the work is done.
---

# TDD

Test-driven development is a feedback loop, not a testing policy. Its value is
the moment a test fails for the reason you predicted.

`ORCA` below is a placeholder for the executable you resolved in the stub;
substitute it before running and do not create a shell variable.

## Outcome

**Result:** each new behavior has a test that failed before the code existed and
passes after it. **Next consumer:** the reviewer, and whoever changes this code
next. **Done:** the target test passes, the suite is no worse than the recorded
baseline, the output is clean, and at least one mutation of the new code is
caught by a test.

**Safe failure:** a test that passes the first time you run it has proved
nothing. Stop and find out why, rather than moving on with a green bar.

## Iron law

**No production code without a failing test first.** If production code was
written before its test, delete it — and do not keep it open as a reference
while writing the test. A test written while looking at the code tests what the
code does, not what it should do.

## The cycle

1. **Red — write the test.** One behavior, named for the behavior.
2. **Verify red — run it and watch it fail.** Not "assume it fails". Two things
   must both hold: it fails, and it fails **for the right reason** — the
   assertion, not a typo, a missing import, or a compile error.
   > A test that passes on its first run is testing behavior that already
   > exists. Either the behavior is already implemented, and you should find out
   > why you thought otherwise, or the test does not exercise what you think.
3. **Green — the minimum code to pass.** Not the general solution. Not the next
   three cases.
4. **Verify green — run it again.** The target test passes, the rest of the
   suite still passes, and the output is **clean**: no new warnings, no new
   deprecation notices, no new log noise. A warning your change introduced is
   part of your change.
5. **Refactor — now, while it is green.** Check the result against the four
   principle lenses shared with `review`, then re-run the suite:
   `ORCA skills get review --reference references/principles.md`.

## Gate 1 — before writing a test

Name, out loud, the **production change that would make this test fail**. If you
cannot name one, the test is not testing your change; redesign it before writing
it.

A failed gate looks like this: a test asserts that a configured timeout equals
thirty seconds, but no code path ever reads that setting — it is written and
never consulted. The test passes whether or not the timeout logic exists, so it
names nothing. Fix it by asserting the observable effect the timeout is supposed
to produce — a request that aborts after thirty seconds — not the constant.

## Gate 2 — before adding a mock

List the real side effects the mock stands in for. Then:

> Never assert on the mock itself. Asserting that a test double was called says
> that you called your own double, not that any behavior happened. Assert on the
> observable result the side effect produces.

Prefer a real implementation, an in-memory fake, or a temporary directory over a
mock whenever one is available: those exercise the real code path instead of a
stand-in you wrote yourself.

## Mutation check

After green, before moving on, pick one mutation and apply it — mentally, or
actually and then revert:

- change a constant to a wrong value;
- flip a branch condition;
- delete a side effect (the write, the emit, the close);
- make a function return empty or zero.

> If a mutation survives and nothing fails, that behavior is unprotected. Write
> the test that catches it.

## Exceptions require asking

Throwaway prototypes and generated code are the only two, and both need the user
to say so. "This is hard to test" is not an exception; it is a design signal that
the code needs a seam.

## Cross-platform and workspace notes

Name the test command the repository actually uses, on every platform it targets,
rather than assuming a shell idiom. A folder workspace with no version control
still runs tests: never make the cycle depend on Git, and never make a mutation
check depend on being able to revert through it — an editor undo or a copy of the
file is enough.

## Red flags

| Thought                                        | Reality                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| "I'll add tests after"                         | Code without a test in front of it does not get one.                       |
| "The test is trivial, I know it fails"         | Run it. "I know" is how untested behavior ships.                           |
| "I'll write all the tests, then all the code"  | Batching breaks the fail-then-pass loop and loses per-test verification.    |
| "I'll assert the mock was called"              | That asserts you called your own double, not that behavior happened.       |
| "The warning was already there"                | Check. If your change did not introduce it, say so rather than assume.     |

## Hands off to

- `debug` — when the failing test is a symptom whose cause is not yet known.
- `verify` — before any "done", "it works", or "tests pass".
- `review` — for the principle lenses in the refactor step, and for a second pass on the diff.
