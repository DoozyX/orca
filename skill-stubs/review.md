# Orca Review

This file is a discovery stub, not the usage guide. The full, version-matched Orca
review reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage this skill when the user asks to review changes, a diff, a branch, or a pull request,
wants a second opinion before committing or merging, or when a dispatched reviewer is told
to run the shared review layers. It runs an adversarial pass starved of the author's intent,
a mechanical edge-case path trace, and a verification-gap check — plus a deletion check when
code was removed — and merges them into one deduplicated, severity-graded, triaged findings
list ending in a machine-readable verdict. Review is read-only. Use the `debug` skill when
something is already misbehaving, `tdd` when the gap is a missing test, and `verify` to back
a completion claim.

<!-- shared: resolver -->

## Load the version-matched guide before running any layer

```text
ORCA skills get review
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers target resolution, layer scoping, merging, and the verdict. Each
layer is a conditional action gate: load only the one you are about to run with
`ORCA skills get review --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`ORCA skills get review --full` and read the named bundled reference before acting.

<!-- shared: no-guessing -->
