---
name: brainstorming
description: >-
  Collaborative design before any code is written: explore the repository's own
  context, ask clarifying questions one frontier round at a time, offer 2-3
  approaches with trade-offs and a recommendation, then write and self-review a
  complete design file the user reads and explicitly approves. Use when the user
  says "let's build", "I want to add", "how should we do X", or asks for a
  design or a spec, and before any feature, behavior change, or refactor of
  consequence. Hard-gates implementation until that file is approved. This is not
  an implementation skill and not a coordination skill: use `delivery` to execute
  an approved design and `orchestration` when the request is only to coordinate or
  supervise agents.
---

# Brainstorming

Brainstorming produces one approved design file before implementation starts. It
is a design skill: it opens no Run, creates no Task, and dispatches no worker,
though it uses read-only agents to look things up and to review the file.

`ORCA` below is a placeholder for the executable you resolved in the stub;
substitute it before running and do not create a shell variable.

## Outcome

One complete design file on disk, reviewed, linked by absolute path, and
approved by the user in their own words. Its readers are the user, then whoever
implements, usually the `delivery` skill reading the same path. If a question
stays unanswered or the user has not read the file, leave the design pending and
say so.

## Classify the role

| Current context                                                         | Role            | Route                                                       |
| ----------------------------------------------------------------------- | --------------- | ----------------------------------------------------------- |
| The current prompt contains a live injected Task/Dispatch preamble      | Executor        | Do not brainstorm; the Task spec is the contract. Follow it |
| The user asks to build, add, change behavior, or wants a design or spec | Designer        | Run the numbered steps below                                |
| An approved design file already exists and the user wants it built      | Delivery caller | Load the `delivery` skill; never re-open an approved design |
| The user asks only to coordinate, supervise, or fan out agents          | Coordinator     | Load the `orchestration` skill                              |

## The gate

Implementation starts after the user approves the written file. Silence, an
approved summary, or "build it" approve the idea, not the design. This holds for
small changes too: a one-liner built on the wrong requirement is still wrong, and
for a small change the file is half a page.

## 1. Explore the repository first

Read `README`, `CLAUDE.md`/`AGENTS.md`, `CONTRIBUTING.md`, the nearest analogous
feature, and any ADR or reference document the area names. In the root worktree,
read earlier runs' `.orca/*/orchestrate/manifest.md` and `retrospective.md` for
decisions taken and approaches rejected here, and `.orca/known-issues.md`. State
what you found in a few lines, so the questions that follow are only the ones
the repository does not answer.

## 2. Clarifying questions, one frontier round at a time

Map the design as a tree of decisions. The **frontier** is every decision whose
prerequisites are settled. Ask the whole frontier in one round, wait, then ask
the next; a question that depends on an open one belongs to a later round.

**Facts are yours; decisions are the user's.** Whatever the environment answers
(does this endpoint paginate, which table holds the flag, does CI run the e2e
suite) you look up: read a single file yourself, and give a multi-file lookup to
a read-only agent that returns the conclusion. Every question you ask carries a
recommended answer, so the user can confirm in one word.

Stop when the frontier is empty; an assumption the user never saw is not a
shortcut. Usually on the frontier: who uses this and how, what breaks today,
what must not change, how it will be verified and through which seam, and for
feature work the data model and each contract that crosses a component boundary.

Load `references/question-rounds.md` for how to deliver a round.

## 3. Approaches, trade-offs, recommendation

Offer two or three. Each gets what it does, what it costs, and what it
forecloses, then one named recommendation with a one-line reason. The design
file's `## Approach` keeps the rejected ones. **Apply YAGNI
ruthlessly:** cut anything serving a requirement the user did not state, and say
what you cut. Check the chosen shape against the principle lenses shared with
`review` (`ORCA skills get review --reference references/principles.md`) and
answer out loud: _does any component here exist for a requirement nobody
stated?_ Cut or justify each one.

Then name the seam the tests drive the feature through, preferring an existing
seam, the highest one that still localizes a failure, and exactly one per unit.
A seam that exists only so a test can reach it is hypothetical: one adapter
behind an interface means the interface was invented for the test; two real
adapters mean the seam is real.

## 4. Write the design file, then check it

Load `references/design-file.md` before writing; it has the location, the
template and the review pass. The file lives in an ignored run directory in the
root worktree and is never committed.

Two checks run before the user sees it, in parallel, each by a fresh read-only
agent given the file path and nothing else from this conversation:

- **Assumptions.** For every `## Assumptions & risks` entry the repository or
  environment can answer, the agent answers it with evidence. A confirmed entry
  moves into the design as a fact; a refuted one changes the design, and comes
  back to the user as a question when it changes a decision they made.
- **Review.** The agent reads the file as its implementer would and reports what
  the checklist in `design-file.md` lists. An author rereading their own file
  sees what they meant; a reader without the conversation sees what it says.

Fix the file from both reports before linking it.

## 5. Link the file and get one explicit approval

Give the user the absolute path to the design file, and to its addendum when
there is one. The chat message is the
TL;DR plus one line per build step (its title and `You'll see`); do not paste
the document unless asked. Then ask once:

```text
Read the complete design file, then approve it or request edits.
```

For feature work, name the build steps' three checks in the same request: is
the granularity right; does each step depend only on steps that truly gate it;
should any step be merged or split. Approval without notes on these checks
approves the steps as drawn.

Wait for the user's explicit approval of that file. A summary, an earlier
agreement on an approach, or your own self-review does not authorize
implementation. On requested edits, update and self-review the file, link it
again with a short change summary, and wait for approval of the revised design.
Do not ask for per-section approvals or re-approval of an unchanged file. After
approval, ask again only for a material change to scope, user-visible behavior,
public interfaces, data handling, or an explicitly excluded item, and explain
that change in the file and in the review request. Editorial fixes and
clarifications need no re-approval.

## 6. Take exactly one exit

- **Focused** — an obvious, low-risk change, even across a few related files.
  Implement it here under `tdd`, and gather evidence under `verify` before
  claiming done. Multi-file alone does not require coordination.
- **Delivered** — several independent units, a non-obvious decomposition, or a
  dedicated implement/review/PR pipeline. Freeze the goal, then hand the design
  path to the `delivery` skill. Load `references/exit-to-delivery.md`.
- **Borderline** — ask one final question with your recommendation and take the
  answer.

## Ground rules

- A folder workspace is valid: the design location resolves without Git.
- A file you did not read on the execution host is not evidence about it.
- The design file is never staged or committed; check that the path exists and
  that Git reports nothing for it.

## Conditional references

Run `ORCA skills get brainstorming --reference references/<file>.md` at the gate
below and read only that document; `--references` lists the names. If the CLI
rejects `--reference`, run `ORCA skills get brainstorming --full` once and read
only the named reference.

| Action gate                                                              | Bundled reference                |
| ------------------------------------------------------------------------ | -------------------------------- |
| Delivering a question round, or no native question tool is available     | `references/question-rounds.md`  |
| Writing the design file, its required sections, ADRs, or the review pass | `references/design-file.md`      |
| Handing an approved design to `delivery`, or freezing the run goal       | `references/exit-to-delivery.md` |
