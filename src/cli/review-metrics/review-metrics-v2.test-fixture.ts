const LEDGER_HEADER =
  '| unit | kind | review# | fix# | base-sha | head-sha | result-sha | dispatch | outcome | reason |'

export function ledger(rows: string[][]): string {
  return [
    'ledger-format: 2',
    '',
    '## Rework',
    '| unit | rework# | reason |',
    '|---|---|---|',
    '| ignored | 1 | pre-review table |',
    '',
    '## Ledger',
    LEDGER_HEADER,
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      ([unit, kind, review, fix, outcome]) =>
        `| ${unit} | ${kind} | ${review} | ${fix} | b | h | r | d | ${outcome} | - |`
    ),
    ''
  ].join('\n')
}

export function findings(lines: string[]): string {
  return [
    '# Review',
    'R1.9. noise.ts:1 - minor - [nit] - x - above the anchor',
    '',
    '## Merged findings',
    ...lines,
    ''
  ].join('\n')
}

export function dispositions(lines: string[]): string {
  return ['# Fix', '', '## Dispositions', ...lines, ''].join('\n')
}

export function buildV2Run(put: (rel: string, text: string) => void): void {
  put(
    'orchestrate/budget.md',
    ledger([
      ['alpha', 'review-full', '1', '-', 'clean'],
      ['alpha', 'nit-fix', '-', '-', 'done'],
      ['beta', 'review-full', '1', '-', 'fix-needed'],
      ['beta', 'fix', '-', '1', 'done'],
      ['beta', 'review-round', '2', '-', 'fix-needed'],
      ['beta', 'fix', '-', '2', 'done'],
      ['beta', 'review-round', '3', '-', 'clean'],
      ['gamma', 'review-full', '1', '-', 'fix-needed'],
      ['gamma', 'fix', '-', '1', 'done'],
      ['gamma', 'review-round', '2', '-', 'fix-needed'],
      ['gamma', 'fix', '-', '2', 'done'],
      ['gamma', 'fix', '-', '3', 'reserved'],
      ['gamma', 'fix', '-', '4', 'quota@12:00'],
      ['gamma', 'review-round', '3', '-', 'fix-needed'],
      ['delta', 'review-full', '1', '-', 'clean'],
      ['delta', 'review-integration', 'I', '-', 'fix-needed']
    ])
  )
  put(
    'orchestrate/alpha/review-1.findings.md',
    findings([
      'R1.1. a.ts:1 - minor - [nit] - style - rename x',
      'class: naming',
      'R1.2. a.ts:9 - minor - [nit] - style - comment',
      'VERDICT: clean'
    ])
  )
  put(
    'orchestrate/alpha/nit-fix.dispositions.md',
    dispositions(['R1.1 - nit-fixed - abc1234', 'R1.2 - nit-skipped - not worth it'])
  )
  put(
    'orchestrate/beta/review-1.findings.md',
    findings([
      'R1.1. b.ts:1 - major - [patch] - logic - broken',
      'evidence: repro',
      'R1.2. b.ts:2 - minor - [patch] - logic - off by one',
      'R1.3. b.ts:3 - minor - [decision-needed] - api - which name',
      'R1.4. b.ts:4 - minor - [defer] - perf - later',
      'VERDICT: fix-needed patch=2 decision-needed=1 nit=0 defer=1'
    ])
  )
  put(
    'orchestrate/beta/fix-1.dispositions.md',
    dispositions([
      'R1.1 - fixed - aaa1111 - swept 2/2',
      'R1.2 - disputed - not a bug - evidence: test x',
      'R1.3 - blocked - needs a call'
    ])
  )
  put(
    'orchestrate/beta/review-2.findings.md',
    findings([
      'Prior: R1.1 - fixed - ok',
      'Prior: R1.2 - disputed-withdrawn - fair',
      'R2.1. b.ts:5 - minor - [patch] - [round-1-miss] - missed earlier',
      'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
    ])
  )
  put(
    'orchestrate/beta/fix-2.dispositions.md',
    dispositions(['R2.1 - fixed - bbb2222 - swept 1/1 - one site'])
  )
  put(
    'orchestrate/beta/review-3.findings.md',
    findings(['Prior: R2.1 - fixed - ok', 'VERDICT: clean'])
  )
  put(
    'orchestrate/gamma/review-1.findings.md',
    findings([
      'R1.1. g.ts:1 - major - [patch] - logic - wrong',
      'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
    ])
  )
  put(
    'orchestrate/gamma/fix-1.dispositions.md',
    dispositions(['R1.1 - disputed - intended - evidence: spec'])
  )
  put(
    'orchestrate/gamma/review-2.findings.md',
    findings([
      'Prior: R1.1 - disputed-upheld - still wrong',
      'R2.1. g.ts:2 - minor - [patch] - logic - also wrong',
      'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
    ])
  )
  put(
    'orchestrate/gamma/fix-2.dispositions.md',
    dispositions([
      'R1.1 - disputed - still intended - evidence: spec 2',
      'R2.1 - fixed - ccc3333 - swept 1/1'
    ])
  )
  put(
    'orchestrate/gamma/review-3.findings.md',
    findings([
      'Prior: R2.1 - fixed - ok',
      'R3.1. g.ts:3 - minor - [decision-needed] - api - pick',
      'VERDICT: fix-needed patch=0 decision-needed=1 nit=0 defer=0'
    ])
  )
  put('orchestrate/delta/review-1.findings.md', findings(['VERDICT: clean']))
  put(
    'orchestrate/delta/review-I.findings.md',
    findings([
      'RI.1. d.ts:3 - major - [patch] - seam - integration break',
      'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
    ])
  )
  put(
    'orchestrate/retrospective.md',
    '# Retro\n\n## Escapes\nESCAPE: leaked to main\n\n## Other\nESCAPE: not in section\n'
  )
}

export const emptyTotals = {
  units: 0,
  meanReviewsToClean: null,
  cleanByReview2Pct: null,
  threePlusPct: null,
  patchPrecision: null,
  round1Misses: 0,
  escapes: 0
}

export const expectedTotals = {
  units: 4,
  meanReviewsToClean: 1.67,
  cleanByReview2Pct: 50,
  threePlusPct: 50,
  patchPrecision: 0.833,
  round1Misses: 1,
  escapes: 1
}

const noDisputes = { raised: 0, upheld: 0, withdrawn: 0, gated: 0 }
const noNits = { fixed: 0, recorded: 0 }

export const expectedUnits = [
  {
    unit: 'alpha',
    reviews: 1,
    fixes: 0,
    outcome: 'clean',
    reviewsToClean: 1,
    findings: { patch: 0, nit: 2, decisionNeeded: 0, defer: 0 },
    round1Misses: 0,
    disputes: noDisputes,
    nits: { fixed: 1, recorded: 1 }
  },
  {
    unit: 'beta',
    reviews: 3,
    fixes: 2,
    outcome: 'clean',
    reviewsToClean: 3,
    findings: { patch: 3, nit: 0, decisionNeeded: 1, defer: 1 },
    round1Misses: 1,
    disputes: { raised: 1, upheld: 0, withdrawn: 1, gated: 0 },
    nits: noNits
  },
  {
    unit: 'gamma',
    reviews: 3,
    fixes: 2,
    outcome: 'needs-attention',
    reviewsToClean: null,
    findings: { patch: 2, nit: 0, decisionNeeded: 1, defer: 0 },
    round1Misses: 0,
    disputes: { raised: 2, upheld: 1, withdrawn: 0, gated: 1 },
    nits: noNits
  },
  {
    unit: 'delta',
    reviews: 1,
    fixes: 0,
    outcome: 'open',
    reviewsToClean: 1,
    findings: { patch: 1, nit: 0, decisionNeeded: 0, defer: 0 },
    round1Misses: 0,
    disputes: noDisputes,
    nits: noNits
  }
]
