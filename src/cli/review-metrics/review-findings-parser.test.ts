import { describe, expect, it } from 'vitest'
import { parseFindingsFile } from './review-findings-parser'
import { findings } from './review-metrics-v2.test-fixture'

const PATH = 'orchestrate/u/review-1.findings.md'

describe('parseFindingsFile', () => {
  it.each([
    ['missing terminator, no head', 'R1.1 broken line'],
    ['missing terminator', 'R1.1 a.ts:1 - major - [patch] - logic - no period'],
    ['malformed ordinal', 'R1.x. a.ts:1 - major - [patch] - logic - bad ordinal'],
    ['missing ordinal', 'R1. a.ts:1 - major - [patch] - logic - no ordinal'],
    ['missing review token', 'R.1. a.ts:1 - major - [patch] - logic - no token'],
    ['missing space after the ID', 'R1.1.a.ts:1 - major - [patch] - logic - no space'],
    ['unknown severity', 'R1.1. a.ts:1 - huge - [patch] - logic - bad severity'],
    ['unknown bucket', 'R1.1. a.ts:1 - major - [fix] - logic - bad bucket'],
    ['numbered instead of an ID', '1. a.ts:1 - major - [patch] - logic - list number'],
    ['bulleted ID', '- R1.1. a.ts:1 - major - [patch] - logic - bullet'],
    ['lowercase ID', 'r1.1. a.ts:1 - major - [patch] - logic - lowercase']
  ])('reports a finding-like line with a %s', (_shape, line) => {
    const parsed = parseFindingsFile(findings([line, 'VERDICT: clean']), PATH)
    expect(parsed.findings).toEqual([])
    expect(parsed.errors).toEqual([`${PATH}: unparseable line "${line}"`])
  })

  it('ignores the non-finding lines a findings file carries after the anchor', () => {
    const parsed = parseFindingsFile(
      findings([
        'R1.1. a.ts:1 - major - [patch] - logic - valid',
        'class: logic',
        'evidence: a.ts:3 - major - reproduced twice',
        'Seen: R1.2 duplicates R1.1',
        'Scored: 1 finding',
        'Checked: tests focused cmd=pnpm test a.ts:1 exit=0',
        'Rerun alone passed',
        '',
        'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
      ]),
      PATH
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.findings).toEqual([{ id: 'R1.1', bucket: 'patch', round1Miss: false }])
  })
})
