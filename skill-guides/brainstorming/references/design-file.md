# The design file

Load this reference before writing the design.

The design is read first by the user, who has to approve it, and then by
whoever implements it. Write for the user: someone who should be able to see,
from the file alone, what they will get, how it will be built, and in which
steps. The implementer needs the same things, so the two readers never pull
against each other.

## Size and length

State the size in the TL;DR: `bug fix` (one wrong behaviour, one root cause),
`feature` (new or changed behaviour in one or two subsystems), or `large`
(several subsystems, or five or more build steps). A bug-fix design is about
half a page. For the others, length follows the decisions: a sentence or two per
section when the work is straightforward, more only where a reader would
otherwise have to guess.

**Addendum.** Detail that supports a decision but would bury it goes in
`addendum.md` beside `design.md`: long tables, migration mappings, edge-case
catalogues, prototype snippets. Link it from the section or step that needs it.
Every decision, story, and step card stays in the main file; the addendum only
elaborates them, and the user approves both files together. Most designs have
no addendum.

## Template

Every design uses these sections in this order. A section that does not apply
says so in one line and is not dropped silently.

```markdown
# <Title>

> **TL;DR:** <2–3 sentences: what changes, for whom, and the chosen approach.>
> **Size:** bug fix | feature | large

## Before / After

**Before:** <what the user experiences today, in their terms>
**After:** <what they experience once this lands>

<Feature work: user stories with stable IDs, as many as the behaviour needs,
edge cases included.>

- **US-1** As a <actor>, I want <capability>, so that <benefit>.

## Approach

<The chosen approach in 2–5 sentences.>

| Alternative considered | Why not                       |
| ---------------------- | ----------------------------- |
| <option>               | <cost, or what it forecloses> |

**Cut under YAGNI:** <what was left out because nobody asked for it, or "nothing">

## Design

### Architecture

<Components, what each is responsible for, the data flow, and the existing
code each one touches. Add a Mermaid diagram when three or more components
talk to each other or any flow is asynchronous.>

### Interfaces

<The shared contracts, written out.>

<For a changed data model, use field tables: Field | Type | Nullable | Keys |
Constraints. For relational models, add a Mermaid erDiagram showing entities,
cardinality, and important identity relationships. Keep concrete contracts
alongside these views; omit views that add no information to a simple design.>

## How it will be built

<A Mermaid flowchart of step order, with one edge per `Depends on`. Skip it
when there is only one step.>

### Step 1 — <title>

**You'll see:** <the observable result once this step lands: UI, CLI output,
or behaviour a test pins>
**How:** <the concrete changes: components, symbols, data shapes, migrations,
enough that a reader can picture the diff>
**Covers:** <US-ids, or —> · **Implements:** <interfaces, or —> · **Depends on:** <steps, or —> · **Parallel-safe:** yes|no
**Done when:**

- [ ] <US-id:> <an observable criterion, and the test or check that proves it>

## Testing Decisions

## Out of scope

## Assumptions & risks
```

### What each section must carry

- **TL;DR**: enough that a user who reads only this block knows what they are
  approving. Write it last, and make sure it agrees with the body.
- **Before / After**: user-visible behaviour, not implementation. For a bug
  fix it is two lines: the wrong behaviour and the right one, and no stories.
  Story IDs (`US-1`, `US-2`, …) are stable: never renumber or reuse one after
  the user has seen it; a dropped story is struck through, not deleted.
- **Approach**: the 2–3 approaches from step 3 of the guide, preserved. The
  rejected ones stay in the file so a later reader never asks "why not the
  other way?"
- **Design**: feature work only. A bug fix or a one-file change says
  `Not needed: <reason>` in one line.
  - `### Architecture` covers components, responsibilities, data flow, and the
    existing code each one touches.
  - `### Interfaces` writes the contracts out: short signatures, schemas,
    message and event shapes, CLI and API surfaces, and the settled data
    model. "Similar to X" is not an interface. Write names, signatures, and
    schemas here, never file paths. The one snippet that belongs here is one
    that states a decision more precisely than prose can.
- **How it will be built**: the build steps, in order. These are what the user
  reads to see what will be done. `delivery` also treats them as its task
  list.
  - **Each step is a vertical slice.** It lands a thin end-to-end path that is
    green on its own, not a horizontal layer that works only once every other
    layer exists.
  - **Wide mechanical changes** are sequenced expand, migrate, contract.
  - **`How`** names the modules and symbols it changes. A path to an existing
    file is fine for orientation; line numbers are not.
  - **`Covers`** names the stories a step makes true, and each `Done when`
    item that proves a story starts with its ID. Every story appears in at
    least one step's `Covers`, so coverage is a lookup, not a judgement.
  - **`Done when`** lists acceptance criteria that `verify` maps to commands.
  - **A bug fix is one step,** and its `How` states the root cause.
  - **Step count sets the delivery shape.** One step means `delivery` launches
    one implementer and no planner. Two or more steps, with every interface
    they name defined under `### Interfaces`, mean a planner only elaborates
    them into task files and never re-decomposes.
- **Testing Decisions**: reviewers are held to this section; without it, each
  one invents a different bar. It names:
  - the seam the tests drive the feature through;
  - the prior-art tests the new ones are modelled on, by test name and
    package, not by path;
  - what a good test asserts;
  - what is verified manually instead, and why.

  For a bug fix it is the regression test's seam, in two lines.

- **Out of scope**: what this design explicitly does not do.
- **Assumptions & risks**: what the design relies on that nobody could
  confirm, and what would break it. Anything the repository or environment can
  answer is checked before the user sees the file, so what remains here is
  genuinely open. Write `none` rather than inventing entries.

### Presenting data models

When the design introduces or changes a data model, put readable field tables
under `### Interfaces`, one per entity or distinct record shape. State each
field's name, type, nullability, keys (primary, foreign, unique, including
composite membership), and constraints. Name foreign-key targets and spell out
enum values, conditional requirements, defaults, and validation rules where
they apply; use `none` when there is no key or constraint. Existing unchanged
fields need only enough context to understand the change.

For relational models, use a Mermaid `erDiagram` to show entities, relationship
cardinality and optionality, and important identity relationships such as tenant
ownership or composite foreign keys. Label relationships clearly; constraints
the diagram cannot express stay in the tables and concrete schema contracts.
Add a state diagram only when lifecycle transitions need explaining, or a flow
diagram when order, branching, or asynchronous data movement needs explaining.

Tables and graphs complement rather than replace concrete contracts: keep
signatures, schemas, payload shapes, and behavior rules precise. Keep simple
designs simple: a small record can use one compact table, and an isolated record
or a change with no meaningful relationships needs no ER diagram. Do not add
unchanged entities or extra diagrams just to fill the template.

## Durable decisions (ADR)

A decision outlives the run as an ADR only when all three hold: hard to reverse
once code is built on it; surprising to a reader without this brainstorm's
context; and the result of a real trade-off rather than the only sensible option.
An ADR is one paragraph — context, decision, the alternative rejected and why —
destined for `docs/adr/NNNN-<slug>.md` in the repository and committed with the
code. Write it beside the design as `adr/NNNN-<slug>.md` and name it in the
design, on the first build step or in one line under `## Approach`; the
implementer copies and commits it in its branch. Most designs produce zero ADRs.
Write none rather than one that fails a condition.

## Review checklist

The fresh review agent reports, with the line each one is on:

- placeholders (`TBD`, "etc.", "handle errors") and steps whose `How` is too
  vague to picture the diff ("update the store", "wire it up");
- scope past what the user asked for;
- ambiguity a reader without the conversation would resolve differently;
- contradictions: for every named state, mode, step, component and value, search
  the file for the name and confirm every mention agrees;
- a TL;DR that no longer matches the body;
- a `You'll see` that is not observable;
- a story no step's `Covers` names, or a `Covers` ID with no story;
- a decision, story or step that exists only in the addendum;
- an interface a step names that `### Interfaces` does not define, or a data
  model table missing types, nullability, keys or constraints, or disagreeing
  with its ER diagram;
- a step that depends on a later step, or a flowchart edge that disagrees with a
  `Depends on` line;
- a `## Testing Decisions` section that says "add tests" without a seam and a
  prior-art test.

## Location

Designs live at `.orca/<date>-<slug>/design/design.md` in the **root worktree**,
the repository's main checkout, not a linked worktree you may be sitting in. One
directory per initiative: `design/` holds the design and the goal, `plan/` the
per-unit plans, `orchestrate/` the run's manifest and stage files. A later
session in any worktree finds the design by its absolute path, whatever its
branch contains, which is why nothing here is committed. Only the ADR copy an
implementer commits under `docs/adr/` leaves the run directory.

To set it up:

1. The root is the first `worktree` entry of `git worktree list --porcelain`
   (`git rev-parse --show-toplevel` names the linked worktree instead).
2. If `git -C <root> check-ignore -q <root>/.orca/.probe` does not exit 0, add
   the line `/.orca/` to `info/exclude` under the repository's common Git
   directory (`git -C <root> rev-parse --git-common-dir`). That file is
   untracked and applies to every worktree.
3. Create `design/`, `plan/` and `orchestrate/` under the run directory.

In a folder workspace `git worktree list` fails: use the workspace root, create
the same directories, and skip step 2.

After writing, `git -C <root> status --porcelain <design-path>` prints nothing
for a correctly placed file.
