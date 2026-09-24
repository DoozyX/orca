# The design file

Load this reference before writing the design.

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

## Required sections

Every design, bug fix included, carries:

- `## Motivation` — what breaks today, in the user's terms.
- `## Decisions` — what was settled and what was cut under YAGNI.
- `## Testing Decisions` — the seam the tests drive the feature through, the
  prior-art tests the new ones are modelled on (by test name and package, not by
  path), what a good test asserts, and what is verified manually instead and why.
  Reviewers are held to this section; without it each one invents a different bar.
  For a bug fix it is the regression test's seam, in two lines.
- `## Out of scope` — what this design explicitly does not do.

Feature work — not a bug fix, not a one-file change — adds three more after
`## Decisions`, and says in one line when it is skipping them:

- `## Architecture` — components, responsibilities, data flow, and which existing
  code each one touches.
- `## Interfaces` — the concrete shared contracts written out: short signatures,
  schemas, message and event shapes, CLI and API surfaces, and the settled data
  model. "Similar to X" is not an interface. Write decisions, not locations:
  names, signatures, and schemas, never file paths, which go stale before the
  implementer reads them. The one snippet that belongs here is one that states a
  decision more precisely than prose can.
- `## Decomposition sketch` — ordered work units, one line each:
  `- U<n> <title> - implements: <iface,...> depends: <U..> parallel-safe: yes|no`.
  Units are vertical slices: each lands a thin end-to-end path that is green on
  its own, not a horizontal layer that only works once every other layer exists.
  A wide mechanical change is sequenced expand, migrate, contract. One unit means
  `delivery` launches one implementer and no planner; two or more units with every
  named interface defined above mean a planner only elaborates them and never
  re-decomposes.

## Durable decisions (ADR)

A decision outlives the run as an ADR only when all three hold: hard to reverse
once code is built on it; surprising to a reader without this brainstorm's
context; and the result of a real trade-off rather than the only sensible option.
An ADR is one paragraph — context, decision, the alternative rejected and why —
destined for `docs/adr/NNNN-<slug>.md` in the repository and committed with the
code. Write it beside the design as `adr/NNNN-<slug>.md` and name it in the
design, on the first sketch unit or in one line under `## Decisions`; the
implementer copies and commits it in its branch. Most designs produce zero ADRs.
Write none rather than one that fails a condition.

## Self-review checklist

Read the finished document for:

- placeholders (`TBD`, "etc.", "handle errors");
- scope creep past what the user asked for;
- ambiguity a fresh reader would resolve differently than you meant;
- internal contradictions — two sections disagreeing on the same value, such as a
  prose timeout of 30 s and a table row of 60 s;
- `## Testing Decisions` naming a seam and a prior-art test rather than "add tests";
- for feature work, that `## Architecture`, `## Interfaces`, and
  `## Decomposition sketch` exist, that every interface a sketch unit names is
  defined in `## Interfaces`, and that no unit depends on a unit sequenced after it.

For contradictions, do a mechanical pass rather than a read-through: list every
named region, state, mode, or component the design defines, search the document
for each name, and confirm every mention agrees on its behavior. Fix the document
in place before linking it. Self-review is not user approval.
