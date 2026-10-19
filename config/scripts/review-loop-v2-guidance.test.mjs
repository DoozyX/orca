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
})
