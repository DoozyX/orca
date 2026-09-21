---
name: brainstorming
description: >-
  Collaborative design before any code is written: explore the repository's own
  context, ask clarifying questions one frontier round at a time, offer 2-3
  approaches with trade-offs and a recommendation, then write and self-review a
  complete design file the user reads and explicitly approves. Use when the user
  says "let's build", "I want to add", "how should we do X", or asks for a
  design or a spec, and before any feature, behavior change, or refactor of
  consequence. Hard-gates implementation until that file is approved. Use the
  `delivery` skill to execute an approved design, and `orchestration` when the
  request is only to coordinate or supervise agents.
---

# Brainstorming

Brainstorming produces one approved design file before any implementation
starts. It is a design skill, not a coordination skill: it opens no Run,
creates no Task, and dispatches no worker.

`ORCA` below is a placeholder for the executable you resolved in the stub;
substitute it before running and do not create a shell variable.

## Outcome

**Result:** one complete design file on disk, self-reviewed, linked by absolute
path, and explicitly approved by the user. **Next consumer:** the user, then
whoever implements — usually the `delivery` skill reading that same path.
**Done:** the frontier of open decisions is empty, the file names its testing
decisions, and the user has approved that file in their own words.

**Safe failure:** leave the design pending and say so. An unanswered question,
an unread file, or an assumption the user never saw is a checkpoint, never
permission to start writing code.

## Classify the role

| Current context                                                                             | Role            | Route                                                              |
| ------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| The current prompt contains a live injected Task/Dispatch preamble                          | Executor        | Do not brainstorm; the Task spec is the contract. Follow it        |
| The user asks to build, add, change behavior, or wants a design or spec                     | Designer        | Run the numbered steps below                                       |
| An approved design file already exists and the user wants it built                          | Delivery caller | Load the `delivery` skill; never re-open an approved design        |
| The user asks only to coordinate, supervise, or fan out agents                              | Coordinator     | Load the `orchestration` skill                                     |

A dispatched worker detects its role from the live preamble, not from an
environment variable, a terminal title, or a pane. An executor that believes its
Task is genuinely wrong says so in one line and stops; it does not design around it.

## The hard gate

No implementation, and no implementation skill, until the complete design file
has been written, self-reviewed, linked for the user, and explicitly approved by
the user. Never approve on the user's behalf, and never read silence or elapsed
time as approval. "It's a one-liner" is how this gate is usually skipped, and a
one-liner built on the wrong requirement is still wrong.

## 1. Explore the repository's own context first

Read `README`, `CLAUDE.md`/`AGENTS.md`, `CONTRIBUTING.md`, and the nearest
analogous feature. Skim `docs/adr/` and any `docs/reference/` document the area
names, so a trade-off already settled is not re-litigated. State what you found
in a few lines. Questions asked without that context spend the user's turns on
what the repository already answers.

## 2. Clarifying questions, one frontier round at a time

Map the design as a tree of decisions. The **frontier** is every decision whose
prerequisites are already settled; a question that depends on an open question
belongs to a later round. Ask the whole frontier in one round, wait, then ask
the next.

**Facts are yours; decisions are the user's.** A question the environment
answers — does this endpoint paginate, which table holds the flag, does CI run
the e2e suite — is never asked. Look it up. Every question you do ask carries a
recommended answer, so the user spends one word confirming or overriding it.

Stop when the frontier is empty. There is no cap on rounds and no credit for
finishing early with an assumption the user never saw. Usually on the frontier:
who uses this and how; what breaks today; what must not change; how it will be
verified and through which seam; and, for feature work, the data model and every
contract that crosses a component boundary.

Load `references/question-rounds.md` for the delivery mechanics of a round.

## 3. Approaches, trade-offs, recommendation

Offer two or three. Each gets what it does, what it costs, and what it
forecloses, then one named recommendation with a one-line reason. **Apply YAGNI
ruthlessly:** cut anything serving a requirement the user did not state, and say
what you cut. Then name the seam the tests drive the feature through, preferring
an existing seam and the highest one that still localizes a failure.

## 4. Write the design file, then self-review it

The design is scaffolding for the work, not a deliverable: it is written to a
workspace-local ignored directory and never committed, never staged, and never
present in a branch, diff, or PR. Load `references/design-file.md` before
writing — it owns the path, the ignore step, the folder-workspace path that
requires no Git, the required sections, and the self-review checklist.

Self-review is not user approval. Fix placeholders, contradictions, scope creep,
and ambiguity in the file before linking it.

## 5. Link the file and get one explicit approval

Give the user the absolute path to the design file. Keep the chat message to a
short summary; do not paste the document unless asked. Then ask once:

```text
Read the complete design file, then approve it or request edits.
```

Wait for the user's explicit approval of that file. A summary, an earlier
agreement on an approach, or your own self-review does not authorize
implementation. On requested edits, update and self-review the file, link it
again with a short change summary, and wait for approval of the revised design.
Do not ask for per-section approvals or re-approval of an unchanged file. After
approval, ask again only for a material change to scope, user-visible behavior,
public interfaces, data handling, or an explicitly excluded item.

## 6. Take exactly one exit

- **Focused** — an obvious, low-risk change, even across a few related files.
  Implement it here, test-first, and show command evidence before claiming done.
  Multi-file alone does not require coordination.
- **Delivered** — several independent units, a non-obvious decomposition, or a
  dedicated implement/review/PR pipeline. Freeze the goal, then hand the design
  path to the `delivery` skill. Load `references/exit-to-delivery.md`.
- **Borderline** — ask one final question with your recommendation and take the
  answer.

## Safety floor

- Folder workspaces are valid. Never require Git and never assume a worktree:
  the design file's location must resolve in a plain folder too.
- The execution host owns every process, filesystem, and transcript fact. A file
  you did not read on that host is not evidence about it.
- When you observe another agent or terminal, preserve the verdict vocabulary
  `live` / `unverifiable` / `exited`. Loss of contact is not process death.
- Never commit, stage, or `git add` the design file, and never verify it by
  looking for a commit. Verify the path exists and that Git reports nothing for it.

## Conditional references

Run `ORCA skills get brainstorming --reference references/<file>.md` at the gate
below and read only that document; `--references` lists the names. If the CLI
rejects `--reference`, run `ORCA skills get brainstorming --full` once and read
only the named reference. If it rejects `--full` too, keep this kernel's safety
floor and use that command's `--help`; never guess newer flags.

| Action gate                                                                     | Bundled reference                   |
| --------------------------------------------------------------------------------- | ----------------------------------- |
| Delivering a question round, or no native question tool is available            | `references/question-rounds.md`     |
| Writing the design file, its required sections, ADRs, or the self-review pass   | `references/design-file.md`         |
| Handing an approved design to `delivery`, or freezing the run goal              | `references/exit-to-delivery.md`    |

## Red flags

| Rationalization                              | Reality                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| "This is obviously what they want"           | Confirm it. The gate exists for the cases where it is not.                       |
| "I'll design as I code"                      | That is implementation wearing a design costume. Present first.                  |
| "I'll ask everything at once to save time"   | Ask the frontier, not the tree. A prose batch returns one answer covering two.   |
| "I'll just ask whether the API paginates"    | That is a fact, not a decision. Look it up.                                      |
| "They said build it, so approval is implied" | "Build it" approved the idea, not the design. Link the file and wait.            |
| "They approved my summary"                   | The file is what gets approved, and it must exist and be self-reviewed first.    |
