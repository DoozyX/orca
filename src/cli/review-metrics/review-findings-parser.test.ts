import { describe, expect, it } from 'vitest'
import { parseFindingsFile } from './review-findings-parser'
import { findings } from './review-metrics-v2.test-fixture'

const PATH = 'orchestrate/u/review-1.findings.md'

describe('parseFindingsFile', () => {
  const ID_RULE = '; expected "R<r>.<n>." with <r> 1-3 or I, then a space'
  const SEVERITY_RULE = 'finding line has severity "huge"; expected critical|major|minor'
  const PROSE_RULE =
    'line starts like a finding ID but is not a finding; put explanations in a "Checked:" line'
  const PRIOR_RULE =
    'malformed Prior line; expected "Prior: R<r>.<n> - fixed|open|disputed-upheld|disputed-withdrawn - <reason>"'
  it.each([
    ['missing terminator, no head', 'R1.1 broken line', PROSE_RULE],
    [
      'missing terminator',
      'R1.1 a.ts:1 - major - [patch] - logic - no period',
      `finding line has ID "R1.1"${ID_RULE}`
    ],
    [
      'malformed ordinal',
      'R1.x. a.ts:1 - major - [patch] - logic - bad ordinal',
      `finding line has ID "R1.x."${ID_RULE}`
    ],
    [
      'missing ordinal',
      'R1. a.ts:1 - major - [patch] - logic - no ordinal',
      `finding line has ID "R1."${ID_RULE}`
    ],
    [
      'missing review token',
      'R.1. a.ts:1 - major - [patch] - logic - no token',
      `finding line has ID "R.1."${ID_RULE}`
    ],
    [
      'missing space after the ID',
      'R1.1.a.ts:1 - major - [patch] - logic - no space',
      `finding line has ID "R1.1.a.ts:1"${ID_RULE}`
    ],
    ['unknown severity', 'R1.1. a.ts:1 - huge - [patch] - logic - bad severity', SEVERITY_RULE],
    [
      'unknown bucket',
      'R1.1. a.ts:1 - major - [fix] - logic - bad bucket',
      'finding line has bucket "[fix]"; expected [patch|nit|decision-needed|defer]'
    ],
    [
      'bare bucket',
      'R1.1. a.ts:1 - major - patch - logic - bare bucket',
      'finding line has bucket "patch"; expected [patch|nit|decision-needed|defer]'
    ],
    [
      'uppercase bucket after a valid ID',
      'R1.1. a.ts:1 - major - [PATCH] - logic - uppercase bucket',
      'finding line has bucket "[PATCH]"; expected [patch|nit|decision-needed|defer]'
    ],
    [
      'uppercase severity after a valid ID',
      'R1.1. a.ts:1 - Major - [patch] - logic - uppercase severity',
      'finding line has severity "Major"; expected critical|major|minor'
    ],
    [
      'bucket before severity after a valid ID',
      'R1.1. a.ts:1 - [patch] - major - logic - x',
      'finding line has severity "[patch]"; expected critical|major|minor'
    ],
    [
      'no separators after a valid ID',
      'R1.1. broken line',
      'finding line needs " - " (hyphen) between location, severity, [bucket], tags and text'
    ],
    [
      'em-dash separators after a valid ID',
      'R1.1. a.ts:1 \u2014 major \u2014 [patch] \u2014 [Edge] \u2014 x',
      'finding line needs " - " (hyphen) between location, severity, [bucket], tags and text'
    ],
    [
      'missing text field',
      'R1.1. a.ts:1 - major - [patch] - logic',
      'finding line needs " - " (hyphen) between location, severity, [bucket], tags and text'
    ],
    [
      'numbered instead of an ID',
      '1. a.ts:1 - major - [patch] - logic - list number',
      `finding line has ID "1."${ID_RULE}`
    ],
    [
      'bulleted ID',
      '- R1.1. a.ts:1 - major - [patch] - logic - bullet',
      `finding line has ID "-"${ID_RULE}`
    ],
    [
      'lowercase ID',
      'r1.1. a.ts:1 - major - [patch] - logic - lowercase',
      `finding line has ID "r1.1."${ID_RULE}`
    ],
    [
      'em-dash separators',
      '1. R1 \u2014 src/a.ts:50 \u2014 major \u2014 [patch] \u2014 [Edge] \u2014 em-dash',
      `finding line has ID "1."${ID_RULE}`
    ],
    [
      'severity before the file',
      '1. R4 - minor - [defer] - [Edge] - severity-first - src/a.ts:36',
      `finding line has ID "1."${ID_RULE}`
    ],
    [
      'non-R ID',
      '1. F1 - major - [patch] - [Edge] - F prefix',
      `finding line has ID "1."${ID_RULE}`
    ],
    [
      'Windows drive path',
      '1. C:\\src\\a.ts:1 - major - [patch] - logic - drive',
      `finding line has ID "1."${ID_RULE}`
    ],
    [
      'bulleted line range',
      '- a.ts:10-12 - major - [patch] - logic - range',
      `finding line has ID "-"${ID_RULE}`
    ],
    [
      'location without an ID',
      'a.ts:1 - major - [fix] - logic - bad bucket',
      `finding line has ID "a.ts:1"${ID_RULE}`
    ],
    ['lowercase prior', 'prior: R1.1 - disputed-upheld - x', PRIOR_RULE],
    ['prior without a colon', 'Prior R1.1 - disputed-withdrawn - x', PRIOR_RULE],
    [
      'malformed prior ruling',
      'Prior: R1.1 - bogus',
      'Prior line has ruling "bogus"; expected fixed|open|disputed-upheld|disputed-withdrawn (a coordinator-deferred item is open)'
    ],
    [
      'prior ruling the vocabulary lacks',
      'Prior: R1.7 - deferred - x',
      'Prior line has ruling "deferred"; expected fixed|open|disputed-upheld|disputed-withdrawn (a coordinator-deferred item is open)'
    ],
    [
      'prior ID range',
      'Prior: R1.1-R1.11 - held - x',
      'Prior line has ID "R1.1-R1.11"; expected one R<r>.<n> per line (ranges such as R1.1-R1.11 are not allowed)'
    ],
    [
      'prior ID list',
      'Prior: R1.1, R1.2 - fixed - x',
      'Prior line has ID "R1.1, R1.2"; expected one R<r>.<n> per line (ranges such as R1.1-R1.11 are not allowed)'
    ],
    [
      'prior without a ruling',
      'Prior: R1.1',
      'Prior line needs " - " (hyphen) between ID, ruling and reason'
    ],
    ['space before the prior colon', 'Prior : R1.1 - fixed - x', PRIOR_RULE],
    ['hyphen after Prior', 'Prior - R1.1 - fixed - x', PRIOR_RULE],
    ['em dash after Prior', 'Prior \u2014 R1.1 - fixed - x', PRIOR_RULE],
    ['parenthesized prior ID', 'Prior (R1.1) - fixed - x', PRIOR_RULE],
    ['colon-less RI prior', 'Prior RI.1 - fixed - x', PRIOR_RULE],
    [
      'en-dash non-R head',
      '1. F1 \u2013 major \u2013 [patch] \u2013 [Edge] \u2013 x',
      `finding line has ID "1."${ID_RULE}`
    ],
    [
      'critical non-R head',
      '1. F1 - critical - [patch] - [Edge] - x',
      `finding line has ID "1."${ID_RULE}`
    ],
    [
      'unknown severity on a numbered head',
      '1. F1 - high - [patch] - [Edge] - x',
      `finding line has ID "1."${ID_RULE}`
    ],
    [
      'bucket before severity',
      '1. a.ts:1 - [patch] - major - logic - x',
      `finding line has ID "1."${ID_RULE}`
    ]
  ])('reports a finding-like line with a %s', (_lineKind, line, reason) => {
    const parsed = parseFindingsFile(findings([line, 'VERDICT: clean']), PATH)
    expect(parsed.findings).toEqual([])
    expect(parsed.errors).toEqual([`${PATH}: ${reason}: "${line}"`])
  })

  it('names the ID rule in a prose line that opens with a finding ID', () => {
    const line = 'R1.15 to R1.17 are defer; they restate the known issue.'
    const parsed = parseFindingsFile(findings([line, 'VERDICT: clean']), PATH)
    expect(parsed.errors).toEqual([`${PATH}: ${PROSE_RULE}: "${line}"`])
  })

  it.each([
    [
      'a ranged location',
      'R1.3. src/a/b.ts:248-250 - major - [decision-needed] - [Edge] - x',
      { id: 'R1.3', severity: 'major', bucket: 'decision-needed' }
    ],
    [
      'a location list joined by plus',
      'R1.2. src/a/b.ts:248-250 + src/a/c.ts:4-17 - major - [patch] - [Adversarial] - x',
      { id: 'R1.2', severity: 'major', bucket: 'patch' }
    ],
    [
      'a location list joined by comma',
      'R1.4. src/a/b.ts:3, src/a/c.ts:9 - critical - [patch] - [Edge] [round-1-miss] - x',
      { id: 'R1.4', severity: 'critical', bucket: 'patch', round1Miss: true }
    ],
    [
      'a bare file without a line',
      'R1.11. src/a/b.test.ts - minor - [nit] - [V-Gap] - x',
      { id: 'R1.11', severity: 'minor', bucket: 'nit' }
    ]
  ])('accepts %s', (_kind, line, expected) => {
    const parsed = parseFindingsFile(
      findings([line, 'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0']),
      PATH
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.findings).toMatchObject([expected])
  })

  it('reports a malformed VERDICT line instead of a missing one', () => {
    const line = 'VERDICT: clean patch=0 decision-needed=0 nit=3 defer=2'
    const parsed = parseFindingsFile(
      findings(['R1.1. a.ts:1 - minor - [nit] - [Edge] - x', line]),
      PATH
    )
    expect(parsed.verdict).toBeNull()
    expect(parsed.errors).toEqual([
      `${PATH}: malformed VERDICT line "${line}"; expected "VERDICT: clean" or "VERDICT: fix-needed patch=<n> decision-needed=<n> nit=<n> defer=<n>"`
    ])
  })

  it('still reports a missing VERDICT line when the file has none', () => {
    const parsed = parseFindingsFile(findings(['Checked: nothing']), PATH)
    expect(parsed.errors).toEqual([`${PATH}: missing VERDICT line`])
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
        'Rerun. It passed alone.',
        'README.md was not touched.',
        '',
        'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
      ]),
      PATH
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.findings).toMatchObject([{ id: 'R1.1', bucket: 'patch', round1Miss: false }])
  })

  it('ignores lines that only quote a bucket tag', () => {
    const parsed = parseFindingsFile(
      findings([
        'R1.1. a.ts:1 - major - [patch] - logic - valid',
        'evidence: the reviewer tagged it [patch] but it is a [defer]',
        "evidence: review-findings-parser.test.ts:25 `'1. F2 - major - [PATCH] - logic'` | cmd=`pnpm test` exit=1",
        'Seen: R1.2 duplicates R1.1 (major - [patch])',
        'class: logic [patch]',
        'Checked: the minor - [nit] mapping in review.md section 5 still holds',
        'The [decision-needed] bucket is explained in the guide.',
        'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
      ]),
      PATH
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.findings).toMatchObject([{ id: 'R1.1', bucket: 'patch', round1Miss: false }])
  })

  it('ignores prose that opens with Prior', () => {
    const parsed = parseFindingsFile(
      findings([
        'Prior to the fix, the parser rejected this line.',
        'Prior risks were not re-checked.',
        'Prior R1 findings: two fixed, none open.',
        'VERDICT: clean'
      ]),
      PATH
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.priors).toEqual([])
  })
})
