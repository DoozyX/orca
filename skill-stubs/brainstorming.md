# Orca Brainstorming

This file is a discovery stub, not the usage guide. The full, version-matched Orca
brainstorming reference is served by the `orca` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage brainstorming before any feature, behavior change, or refactor of consequence, and
whenever the user says "let's build", "I want to add", "how should we do X", or asks for a
design or a spec. It runs a frontier-round question loop, offers 2-3 approaches with
trade-offs, writes and self-reviews a design file in a workspace-local ignored directory,
and hard-gates implementation until the user explicitly approves that file. Use the
`delivery` skill to execute an approved design, and the `orchestration` skill when the
request is only to coordinate or supervise agents. A session running under a live injected
Task/Dispatch preamble does not brainstorm: its Task spec is the contract.

<!-- shared: resolver -->

## Load the version-matched guide before writing any design

```text
ORCA skills get brainstorming
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers the normal design loop through to the approval gate. For a
conditional action gate such as delivering a question round, writing the design file, or
handing an approved design to `delivery`, load only the reference that gate names with
`ORCA skills get brainstorming --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`ORCA skills get brainstorming --full` and read the named bundled reference before acting.

<!-- shared: no-guessing -->
