# Orca TDD

This file is a discovery stub, not the usage guide. The full, version-matched Orca
test-driven development reference is served by the `orca` binary itself — kept out of this
file on purpose so it can never drift from the binary that will actually run your commands.

Engage this skill before writing production code for a new behavior or a fix, and whenever
tests are being added after the fact. It runs the red/green/refactor cycle: write the
failing test first, run it and watch it fail for the right reason, write the minimum code to
pass, then refactor while it is green — with a gate before writing a test, a gate before
adding a mock, and a mutation check that proves the new test protects something. Use the
`debug` skill when the cause of a failure is not yet known, and `verify` before claiming the
work is done.

<!-- shared: resolver -->

## Load the version-matched guide before writing the test

```text
ORCA skills get tdd
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It is self-contained apart from the shared principle lenses it names in the
refactor step, which live with the `review` topic. If that binary does not recognize the
topic, say so rather than guessing at the cycle.

<!-- shared: no-guessing -->
