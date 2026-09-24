# Verification-gap layer

Load this reference to measure whether the changed behavior is protected.

## The single question

> If this changed behavior stopped holding where it is used, would any test fail?

That is the whole scope. This layer does not review quality, does not review edge
cases, and does not propose designs. Do not widen it.

## Inputs

You receive the diff, the full post-change content of every touched file, and
read access to the rest of the workspace. Tracing consumers without that access
manufactures false positives, so this layer is never run diff-only the way the
adversarial layer is.

## Step 1 — cheap triage first

Before tracing anything, check whether the whole change falls into a class that
carries no behavior to protect. If it does, emit the empty result and stop.

Exits in one step, with no findings: comment or documentation changes; pure
formatting or import reordering; renames with no behavior change and call sites
updated mechanically; additive logging or metrics nothing asserts on; new code not
yet wired to any caller; test-only changes, including fixtures and doubles;
generated files such as lockfiles, generated bindings, and vendored output.

If any part of the change falls outside that list, proceed to step 2 for that part
only. Whitelisted hunks in the same change still exit without tracing.

## Step 2 — bounded consumer tracing

For each behavior the change alters, walk outward from the changed symbol to its
callers, **three hops maximum**. Stop at whichever of these is hit first, and
record which one:

- a hop reaches a test file — record it, that is the protection;
- a hop reaches a public API, entry point, or handler boundary;
- a hop crosses into a third-party or vendored package;
- the third hop is reached, whatever it landed on;
- the fan-out is wider than roughly ten callers at any hop — record "wide
  fan-out, untraced" and stop without enumerating them.

An untraced stop is a legitimate outcome. Do not chase past these limits.

## Step 3 — the demonstration gate

> Name the **one concrete mutation** you could make to the changed code that a
> consumer would observe and that no test would catch: a specific wrong constant,
> a specific flipped condition, a specific removed call. If you cannot name it
> concretely, **drop the finding.** A gap you cannot demonstrate is a guess.

Every candidate must pass this gate before it is reported. It is what keeps this
layer from reporting vague "insufficient test coverage".

**Passes:** the change moves a retry backoff from exponential to fixed delay; the
only caller has no test exercising retry timing, and its test file asserts the
happy path only. Demonstration: hardcode the delay to zero regardless of attempt
number, and no test fails.

**Fails:** the change renames an internal variable and reorders two independent
fields. There is no behavior to mutate, so the "mutation" is a restatement of the
rename. Drop it; step 1 should have caught it.

## Anti-fabrication clause

Never assert that a test exists, covers something, or passes unless you have found
the file and read the assertion. "There is probably a test for this" is not a
finding, and "this is covered" without a file and line is a fabrication. A green
suite is not a substitute for reading the assertion: it says nothing about whether
_this specific_ behavior is asserted.

## Output

A numbered list:

```text
N. <file>:<line> - the behavior that changed, where it is consumed (file and line,
   or "untraced: <stop condition>"), and the demonstration mutation nothing would catch.
```

An empty result is valid and expected for a whitelisted change. Emit exactly
`No verification gaps found.`

## Severity ban

No severity, no ranking. Decided at merge, where the reviewer has the context this
layer was deliberately scoped without.
