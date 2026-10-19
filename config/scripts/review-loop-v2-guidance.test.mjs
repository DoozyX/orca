import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')

function readGuide() {
  return readFileSync(join(projectDir, 'skill-guides', 'review.md'), 'utf8')
}

function readAdversarial() {
  return readFileSync(
    join(projectDir, 'skill-guides', 'review', 'references', 'adversarial.md'),
    'utf8'
  )
}

function readDelivery(relative) {
  return readFileSync(join(projectDir, 'skill-guides', 'delivery', relative), 'utf8')
}

function squash(text) {
  return text.replace(/\s+/gu, ' ').trim()
}

function section(guide, from, to) {
  const start = guide.indexOf(from)
  const end = to ? guide.indexOf(to, start) : guide.length
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return guide.slice(start, end)
}

describe('review loop v2 guide contract', () => {
  it('US-3: replaces the search quota with a per-bucket coverage floor', () => {
    const adversarial = squash(readAdversarial())

    expect(adversarial).toContain('## The coverage floor')
    expect(adversarial).toContain('Coverage: <bucket> - <h> hunks - <k> findings|nothing')
    expect(adversarial).toContain('Zero findings is a legitimate result')
    expect(adversarial).not.toContain('at least ten issues')
    expect(adversarial).not.toContain('**halt**')
    expect(adversarial).not.toContain('Near-zero findings means halt')
    expect(adversarial).not.toContain('Stop at three')
  })

  it('US-3: the merge step reruns a layer with a missing Coverage line', () => {
    const merge = squash(section(readGuide(), '## 4. Merge', '## 5.'))

    expect(merge).toContain(
      'A missing `Coverage:` line for any adversarial checklist bucket means the adversarial layer did not run — run it again before merging.'
    )
    expect(merge).toContain('Only the adversarial layer emits `Coverage:` lines')
  })

  it('US-4: states the merged-finding line format and bucket mapping', () => {
    const guide = readGuide()
    const triage = squash(section(guide, '## 5.', '## 6.'))
    const format = section(guide, '## 6.', '## Later rounds')

    expect(format).toContain(
      'R<r>.<n>. <file>:<line> - <critical|major|minor> - [<patch|nit|decision-needed|defer>] - <tags> - <observation and concrete fix>'
    )
    expect(format).toContain(
      '   class: <bug class, ≤6 words> | sweep: `<search command>` -> <k> sites'
    )
    expect(format).toContain(
      '   evidence: <quoted code + one-line trace>  |  cmd=`<command>` exit=<n> <deciding line>'
    )
    expect(triage).toContain('`patch`, `nit`, `decision-needed`, `defer`')
    expect(triage).toContain('`patch` = mechanical and in scope, fix it now')
    expect(triage).toContain(
      '`decision-needed` = a scope question, a product decision, or a trade-off the spec does not settle'
    )
    expect(triage).toContain('`critical`/`major` → `patch`, `decision-needed` or `defer`')
    expect(triage).toContain('`minor` → `nit`, `decision-needed` or `defer`')
    const sq = squash(format)
    expect(sq).toContain('`class`/`sweep` on every `patch`')
    expect(sq).toContain(
      '`evidence` on every `patch` and every `critical`/`major` `decision-needed`'
    )
    expect(format).toContain('VERDICT: clean')
    expect(format).toContain('VERDICT: fix-needed patch=<n> decision-needed=<n> nit=<n> defer=<n>')
    expect(sq).toContain(
      'Prior: R<r>.<n> - fixed|open|disputed-upheld|disputed-withdrawn - <one-line reason; evidence for a ruling>'
    )
    expect(sq).toContain('re-listed under its **original** ID, never a new one')
  })

  it('US-6: later rounds rule on disputes and bar round-1 misses', () => {
    const later = squash(section(readGuide(), '## Later rounds', '## Conditional references'))

    expect(later).toContain('Rounds ≥2 focus on the fix diff')
    expect(later).toContain('Rule on every `disputed` fix disposition with a `Prior:` line')
    expect(later).toContain("Check each prior `class`'s sweep")
    expect(later).toContain(
      'A new finding in lines unchanged since review #1 must be `critical`/`major` and tagged `[round-1-miss]`'
    )
    expect(later).toContain('a `minor` there becomes `defer`')
  })

  it('US-8: known-issues matching lives in the merge step, never the adversarial layer', () => {
    const guide = readGuide()
    const merge = squash(section(guide, '## 4. Merge', '## 5.'))

    expect(merge).toContain('.orca/known-issues.md')
    expect(merge).toContain('at this merge step only')
    expect(merge).toContain('`defer` tagged `[KI-<n>]`')
    expect(readAdversarial()).not.toContain('known-issues')
    expect(readAdversarial()).not.toContain('KI-')
  })

  // Step 3: delivery and brainstorming v2.
  it('US-1/2: review #1 runs strong on another engine and reruns the full suite itself', () => {
    const pipeline = squash(readDelivery('references/task-pipeline.md'))

    expect(pipeline).toContain(
      'Review #1 runs at the strong tier on another engine when one is eligible; otherwise record `same-engine-review`.'
    )
    expect(pipeline).toContain(
      'Review #1 reruns the full suite itself — the one exception to "no second full suite per revision": it runs after the implementer settles, one run at a time, never concurrently.'
    )
  })

  it('US-5: a fix round carries nits, and dispositions use the I-5 lines', () => {
    const pipeline = squash(readDelivery('references/task-pipeline.md'))
    const prompts = readDelivery('references/stage-prompts.md')
    const flat = squash(prompts)

    expect(pipeline).toContain(
      "A fix round carries that review's `nit` items along with its `patch` items."
    )
    expect(pipeline).toContain(
      'The fix stage writes `orchestrate/<unit>/fix-<f>.dispositions.md` under `## Dispositions`, one line per `patch` and `nit`:'
    )
    for (const line of [
      'R1.2 - fixed - <sha> - swept <a>/<k>[ - <why a<k>]',
      'R1.3 - disputed - <reason> - evidence: <cmd=`…` exit=<n> | quoted code>',
      'R1.5 - blocked - <environment or authority reason>',
      'R1.6 - nit-fixed - <sha>',
      'R1.7 - nit-skipped - <reason>'
    ]) {
      expect(readDelivery('references/task-pipeline.md')).toContain(line)
    }
    expect(pipeline).toContain('`nit-skipped` lines become known-issues `nit` rows at closing.')
    expect(flat).toContain(
      'Fix every `patch` and `nit`; dispute with evidence instead of fixing a wrong one, and write one disposition line each.'
    )
    expect(flat).toContain('`orchestrate/<unit>/fix-<f>.dispositions.md`')
  })

  it('US-7: a second dispute opens a gate without spending a round', () => {
    const pipeline = squash(readDelivery('references/task-pipeline.md'))

    expect(pipeline).toContain(
      'A finding the next review upholds and the fixer disputes again opens a decision gate (`fix as reviewer says` / `accept dispute` / `park unit`); no round is spent on it.'
    )
    expect(pipeline).toContain(
      'A dispute upheld after the budget is spent follows the exhaustion rule.'
    )
  })

  it('US-11: nit-fix is one commit limited to the named lines', () => {
    const pipeline = squash(readDelivery('references/task-pipeline.md'))

    expect(pipeline).toContain(
      'At PR sync the implementer fixes the nits in one `nit-fix` commit that touches only the lines the nits name, and writes `orchestrate/<unit>/nit-fix.dispositions.md` in the same `## Dispositions` format with `nit-fixed`/`nit-skipped` lines.'
    )
    expect(pipeline).toContain(
      'A nit whose fix changes logic is recorded as a known-issues `nit` row instead.'
    )
    expect(pipeline).toContain("The sync's full-suite rerun covers the commit.")
    expect(pipeline).toContain(
      'A task is **done** only when the review verdict is clean (nits and defers may be listed)'
    )
  })

  it('delivery validation enforces the v2 verdict and ledger contract', () => {
    const delivery = squash(readDelivery('../delivery.md'))

    expect(delivery).toContain(
      'a `patch` that is not `critical`/`major` or lacks its required `class`/`sweep`/`evidence` lines'
    )
    expect(delivery).toContain('a `clean` verdict lists any `patch` or `decision-needed` finding')
    expect(delivery).toContain(
      "the verdict line's `patch`, `decision-needed`, `nit` and `defer` counts differ from the merged list"
    )
    expect(delivery).toContain('`orchestrate/budget.md` starts with the line `ledger-format: 2`.')
    expect(delivery).toContain('`nit-fix` is an uncounted `kind`')
    expect(delivery).toContain('extend the budget, or rethink the approach?')
  })

  it('stage prompts fix the canonical findings and dispositions file names', () => {
    const prompts = squash(readDelivery('references/stage-prompts.md'))

    for (const name of [
      '`orchestrate/<unit>/review-<r>.findings.md`',
      '`orchestrate/<unit>/review-I.findings.md`',
      '`orchestrate/<unit>/fix-<f>.dispositions.md`',
      '`orchestrate/<unit>/nit-fix.dispositions.md`'
    ]) {
      expect(prompts).toContain(name)
    }
    expect(prompts).toContain(
      "every layer's raw findings, a line reading exactly `## Merged findings`, the merged list, the `Prior:` lines, `Seen:` and `Scored:` lines, `Checked:` lines, the verdict line."
    )
  })

  it('US-8/9: closing writes known issues and the retrospective carries metrics', () => {
    const closing = squash(readDelivery('references/parking-and-reporting.md'))

    expect(closing).toContain(
      'At closing the coordinator writes `<root worktree>/.orca/known-issues.md`: it adds rows, bumps `seen` and `last-seen`, and removes a row a landed sha fixes, naming that sha in the closing report.'
    )
    expect(closing).toContain('| Review metrics ')
    expect(closing).toContain(
      '`orca orchestration review-metrics --run <this run> --run <previous v2 run>`'
    )
    expect(closing).toContain('| Escapes ')
    expect(closing).toContain(
      'ESCAPE: <unit> - <ci|integration|ab-judge|user> - <file>:<line> - <what> - missed-by: <layer> - fix-at: <guide|lint|known-issues|test|none>'
    )
    expect(closing).toContain('metrics: unavailable on <host>')
  })

  it('US-10: brainstorming step 1 reads known issues and the latest review metrics', () => {
    const step = squash(
      section(
        readFileSync(join(projectDir, 'skill-guides', 'brainstorming.md'), 'utf8'),
        '## 1. Explore',
        '## 2.'
      )
    )

    expect(step).toContain('`<root worktree>/.orca/known-issues.md`')
    expect(step).toContain("the latest retrospective's `## Review metrics`")
  })
  // Fix 1 (review-full #1 findings).
  it('fix-1: every one-suite clause carries the review #1 exception', () => {
    const prompts = squash(readDelivery('references/stage-prompts.md'))

    expect(prompts).toContain(
      'the sole exception is review #1, which reruns the full suite itself after the implementer settles, one run at a time'
    )
    expect(prompts).toContain(
      "everyone else reuses the owner's result for the same revision and environment, except that review #1 owns and reruns the full suite itself"
    )
  })

  it('fix-1: review rounds receive the preceding dispositions file', () => {
    const prompts = squash(readDelivery('references/stage-prompts.md'))

    expect(prompts).toContain(
      'the preceding `fix-<f>.dispositions.md` path and its content, given to the non-adversarial layers only'
    )
  })

  it('fix-1: only resolved findings are not re-raised; disputed and blocked stay reviewable', () => {
    const pipeline = squash(readDelivery('references/task-pipeline.md'))
    const prompts = squash(readDelivery('references/stage-prompts.md'))

    expect(pipeline).toContain(
      'an item already resolved is not re-raised; a `disputed` or `blocked` item stays reviewable under its original ID'
    )
    expect(prompts).toContain(
      'never re-raises an item already resolved; a `disputed` or `blocked` item stays reviewable under its original ID'
    )
  })

  it('fix-1: the v2 endgame replaces the minor-deferral done and exhaustion path', () => {
    const delivery = squash(readDelivery('../delivery.md'))
    const pipeline = squash(readDelivery('references/task-pipeline.md'))

    expect(delivery).toContain(
      'each done task has a clean full-branch review verdict (nits and defers listed)'
    )
    expect(delivery).toContain(
      'A task is `done` only when the verdict is clean (nits and defers may be listed), the PR exists'
    )
    expect(delivery).toContain(
      'When the budget is spent with any `patch` or `decision-needed` left, the unit is `needs-attention` with no PR'
    )
    expect(pipeline).toContain(
      'A task is **done** only when the review verdict is clean (nits and defers may be listed), the PR exists'
    )
    for (const text of [delivery, pipeline]) {
      expect(text).not.toContain('minor` deferrals')
    }
  })
})
