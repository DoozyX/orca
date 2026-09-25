# The design file

Load this reference before writing the design.

The design is read first by the user, who has to approve it, and then by
whoever implements it. Write for the user: someone who should be able to see,
from the file alone, what they will get, how it will be built, and in which
steps. The implementer needs the same things, so the two readers never pull
against each other.

## Template

Every design uses these sections in this order. Scale each section to the
work: a sentence or two when it is straightforward, and up to 200–300 words
when it is nuanced. A section that does not apply says so in one line and is
not dropped silently.

```markdown
# <Title>

> **TL;DR:** <2–3 sentences: what changes, for whom, and the chosen approach.>

## Before / After

**Before:** <what the user experiences today, in their terms>
**After:** <what they experience once this lands>

<Feature work: a numbered list of user stories, as many as the behaviour
needs, edge cases included.>

1. As a <actor>, I want <capability>, so that <benefit>.

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

## How it will be built

<A Mermaid flowchart of step order, with one edge per `Depends on`. Skip it
when there is only one step.>

### Step 1 — <title>

**You'll see:** <the observable result once this step lands: UI, CLI output,
or behaviour a test pins>
**How:** <the concrete changes: components, symbols, data shapes, migrations,
enough that a reader can picture the diff>
**Implements:** <interfaces, or —> · **Depends on:** <steps, or —> · **Parallel-safe:** yes|no
**Done when:**

- [ ] <an observable criterion, and the test or check that proves it>

## Testing Decisions

## Out of scope

## Assumptions & risks
```

### What each section must carry

- **TL;DR**: enough that a user who reads only this block knows what they are
  approving. Write it last, and make sure it agrees with the body.
- **Before / After**: user-visible behaviour, not implementation. For a bug
  fix it is two lines: the wrong behaviour and the right one.
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
  - **`Done when`** lists acceptance criteria that `verify` maps to commands.
    Every user story is covered by at least one step's `Done when`.
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
- **Assumptions & risks**: anything the design relies on that no one
  confirmed, and what would break it. Write `none` rather than inventing
  entries.

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

## Self-review checklist

Read the finished document for:

- placeholders (`TBD`, "etc.", "handle errors");
- scope creep past what the user asked for;
- ambiguity that a fresh reader would resolve differently than you meant;
- internal contradictions: two sections disagreeing on the same value, such as
  a prose timeout of 30 s and a table row of 60 s;
- a TL;DR that no longer matches the body;
- a step whose `You'll see` is not observable, or whose `How` is too vague to
  picture the diff ("update the store", "wire it up");
- a user story that no step's `Done when` covers;
- an interface a step names that `### Interfaces` does not define;
- a step that depends on a step sequenced after it, or a flowchart edge that
  disagrees with a `Depends on` line;
- a `## Testing Decisions` section that says "add tests" instead of naming a
  seam and a prior-art test.

For contradictions, do a mechanical pass rather than a read-through:

1. List every named region, state, mode, step, or component the design defines.
2. Search the document for each name.
3. Confirm that every mention agrees on its behaviour.

Fix the document in place before linking it. Self-review is not user approval.

## Location

Designs live in the ignored directory `.orca/<date>-<slug>/design/design.md` in
the **root worktree** — the repository's main checkout, not a linked worktree you
may be sitting in. One directory per initiative, phase-nested: `design/` holds the
design and the goal, `plan/` the per-unit plans, `orchestrate/` the run's
manifest, handoff, prompts, and worker state. Everything for one initiative
stays together, and each phase keeps its own folder. It is scaffolding for the
work, not a deliverable: it must never be committed, staged, or present in a
branch, diff, or PR. Its absolute path is what makes it findable — a later
session in another worktree reads that path directly, which works regardless of
what any branch contains.

Never create a design, plan, task file, prompt, review, report, or retrospective
outside the run directory. Only the ADR copy an implementer commits under
`docs/adr/` leaves it.

Resolve the root and make the directory ignored before writing. `git rev-parse
--show-toplevel` is wrong here: in a linked worktree it names that worktree. The
first `git worktree list --porcelain` entry is the main checkout on every Git
from the 2.25 baseline up; `--path-format=absolute` is not (2.31), so the common
directory is resolved by `cd`. `info/exclude` lives there, is untracked, and
applies to every worktree, so this costs the user no commit:

```sh
# A bare repository has no main checkout: fall back to the current worktree and say so.
ROOT=$(git worktree list --porcelain | awk 'NR==1{sub(/^worktree /,"");p=$0} NR==2&&$0=="bare"{p=""} END{print p}')
[ -n "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel)
COMMON=$(cd "$ROOT" && cd "$(git rev-parse --git-common-dir)" && pwd)
mkdir -p "$COMMON/info"
grep -qxF '/.orca/' "$COMMON/info/exclude" 2>/dev/null || printf '/.orca/\n' >> "$COMMON/info/exclude"
RUN="$ROOT/.orca/<date>-<slug>"
mkdir -p "$RUN/design" "$RUN/plan" "$RUN/orchestrate"
git -C "$ROOT" check-ignore -q "$ROOT/.orca/.probe"   # must exit 0 before you write
```

PowerShell equivalent, for a Windows session without a POSIX shell:

```powershell
$wt = @(git worktree list --porcelain)
$root = if ($wt[1] -eq 'bare') { git rev-parse --show-toplevel } else { $wt[0] -replace '^worktree ', '' }
Push-Location $root; $common = (Resolve-Path (git rev-parse --git-common-dir)).Path; Pop-Location
$exclude = Join-Path $common 'info/exclude'
New-Item -ItemType Directory -Force -Path (Join-Path $common 'info') | Out-Null
if (-not ((Test-Path $exclude) -and (Select-String -Path $exclude -Pattern '^/\.orca/$' -Quiet))) { Add-Content $exclude '/.orca/' }
foreach ($p in 'design','plan','orchestrate') {
  New-Item -ItemType Directory -Force -Path "$root/.orca/<date>-<slug>/$p" | Out-Null
}
git -C $root check-ignore -q "$root/.orca/.probe"
```

Probe with a path _inside_ the directory, not the directory itself: asked about a
directory that has tracked files under it, `check-ignore` answers "not ignored"
even when the pattern matches, and you would add a duplicate rule and still fail
the gate. The `.probe` file need not exist.

**Folder workspaces are valid and this step must not require Git.** When
`git worktree list` fails, the workspace is a folder, not a worktree: use the
workspace root as `ROOT`, create the same `.orca/<date>-<slug>/` directory and
its three phase folders, and skip the exclude and `check-ignore` steps entirely. Nothing tracks
the file, so nothing needs to ignore it. Never abandon the design file, and never
ask the user to initialize a repository, because Git is absent.

## Verify placement, not a commit

```bash
test -f "<design-path>" && git -C "$ROOT" status --porcelain "<design-path>"
```

The file must exist and `status` must print nothing, because ignored means
invisible. In a folder workspace, the `test -f` alone is the check.
