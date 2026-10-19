import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../index'
import { parseFindingsFile } from './review-findings-parser'
import { readRunMetrics } from './review-metrics-run-reader'
import { formatReviewMetricsText } from './review-metrics-text'
import { computeTotals } from './review-metrics-totals'
import type { ReviewMetrics, UnitMetrics } from './review-metrics-types'
import { buildV2Run, expectedTotals, findings, ledger } from './review-metrics-v2.test-fixture'

describe('review-metrics edge cases', () => {
  let root: string
  let stdout: string[]
  let errors: string[]
  // Why skip: mode 000 blocks neither root nor Windows readers.
  const modeBitsIgnored = process.platform === 'win32' || process.getuid?.() === 0

  function put(rel: string, text: string, base = root): void {
    const path = join(base, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }

  function runCli(...runs: string[]): Promise<void> {
    return main(
      ['orchestration', 'review-metrics', '--json', ...runs.flatMap((r) => ['--run', r])],
      root
    )
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-review-metrics-edge-'))
    stdout = []
    errors = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(String(chunk))
      return true
    })
    vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
      errors.push(String(message))
    })
    process.exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
    process.exitCode = undefined
  })

  it('prints one ReviewMetrics object, reports the missing dir on stderr, and exits 1', async () => {
    const good = join(root, 'good')
    mkdirSync(good)
    buildV2Run((rel, text) => put(rel, text, good))
    await runCli('good', 'missing')
    const output: ReviewMetrics = JSON.parse(stdout.join(''))
    expect(output.runs).toHaveLength(1)
    expect(output.totals).toEqual(expectedTotals)
    expect(errors).toEqual([
      expect.stringContaining(`Cannot read run directory ${join(root, 'missing')}`)
    ])
    expect(process.exitCode).toBe(1)
  })

  it.skipIf(modeBitsIgnored)(
    'keeps parsed runs when a later run directory is unreadable',
    async () => {
      const good = join(root, 'good')
      const locked = join(root, 'locked')
      mkdirSync(good)
      mkdirSync(locked)
      buildV2Run((rel, text) => put(rel, text, good))
      chmodSync(locked, 0o000)
      try {
        await runCli('good', 'locked')
      } finally {
        chmodSync(locked, 0o700)
      }
      expect(JSON.parse(stdout.join('')).runs).toHaveLength(1)
      expect(errors).toEqual([
        expect.stringContaining(`Cannot read run directory ${join(root, 'locked')}`)
      ])
      expect(process.exitCode).toBe(1)
    }
  )

  it.skipIf(modeBitsIgnored)(
    'records an unreadable findings file as a parse error and still prints the unit',
    () => {
      put('orchestrate/budget.md', ledger([['solo', 'review-full', '1', '-', 'clean']]))
      put('orchestrate/retrospective.md', '## Escapes\nnone\n')
      const file = join(root, 'orchestrate/solo/review-1.findings.md')
      put('orchestrate/solo/review-1.findings.md', findings(['VERDICT: clean']))
      chmodSync(file, 0o000)
      try {
        const run = readRunMetrics(root)
        expect(run.units.map((unit) => unit.unit)).toEqual(['solo'])
        expect(run.parseErrors).toHaveLength(1)
        expect(run.parseErrors[0]).toContain('orchestrate/solo/review-1.findings.md: unreadable')
      } finally {
        chmodSync(file, 0o600)
      }
    }
  )

  it('counts integration-only findings and misses in the totals', () => {
    put('orchestrate/budget.md', ledger([['only', 'review-integration', 'I', '-', 'fix-needed']]))
    put(
      'orchestrate/only/review-I.findings.md',
      findings([
        'RI.1. d.ts:3 - major - [patch] - [round-1-miss] - integration break',
        'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
      ])
    )
    put('orchestrate/retrospective.md', '## Escapes\nnone\n')
    const totals = readRunMetrics(root).totals
    expect(totals.units).toBe(0)
    expect(totals.patchPrecision).toBe(1)
    expect(totals.round1Misses).toBe(1)
  })

  it('reports a finding-like line with an invalid review token', () => {
    const parsed = parseFindingsFile(
      findings(['RX.1. a.ts:2 - major - [patch] - logic - invalid ID', 'VERDICT: clean']),
      'orchestrate/u/review-1.findings.md'
    )
    expect(parsed.errors).toEqual([
      'orchestrate/u/review-1.findings.md: unparseable line "RX.1. a.ts:2 - major - [patch] - logic - invalid ID"'
    ])
  })

  it('does not treat [not-round-1-miss] as the round-1-miss tag', () => {
    const parsed = parseFindingsFile(
      findings([
        'R1.1. a.ts:2 - major - [patch] - [not-round-1-miss] - near match',
        'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
      ]),
      'p'
    )
    expect(parsed.errors).toEqual([])
    expect(parsed.findings[0].round1Miss).toBe(false)
  })

  it('reports a padded ledger-format marker as unparsed', () => {
    put('orchestrate/budget.md', '  ledger-format: 2  \n')
    expect(readRunMetrics(root)).toMatchObject({ format: 'unparsed', parseErrors: [] })
  })

  it('formats a table of 150000 units without exceeding the argument limit', () => {
    const unit: UnitMetrics = {
      unit: 'u',
      reviews: 1,
      fixes: 0,
      outcome: 'clean',
      reviewsToClean: 1,
      findings: { patch: 0, nit: 0, decisionNeeded: 0, defer: 0 },
      round1Misses: 0,
      disputes: { raised: 0, upheld: 0, withdrawn: 0, gated: 0 },
      nits: { fixed: 0, recorded: 0 }
    }
    const units = Array.from({ length: 150000 }, () => unit)
    const metrics: ReviewMetrics = {
      runs: [
        {
          run: 'big',
          format: 'v2',
          units,
          totals: computeTotals(units, 0),
          escapes: 0,
          parseErrors: []
        }
      ],
      totals: computeTotals(units, 0)
    }
    expect(formatReviewMetricsText(metrics)).toContain('ALL RUNS')
  })

  it('formats 150000 parse errors without exceeding the argument limit', () => {
    const parseErrors = Array.from({ length: 150000 }, (_, index) => `f.md: error ${index}`)
    const metrics: ReviewMetrics = {
      runs: [
        {
          run: 'noisy',
          format: 'v2',
          units: [],
          totals: computeTotals([], 0),
          escapes: 0,
          parseErrors
        }
      ],
      totals: computeTotals([], 0)
    }
    const text = formatReviewMetricsText(metrics)
    expect(text).toContain('  f.md: error 149999')
    expect(text).toContain('ALL RUNS')
  })

  it('collects 150000 unparseable lines from one findings file', () => {
    put('orchestrate/budget.md', ledger([['noisy', 'review-full', '1', '-', 'clean']]))
    put('orchestrate/retrospective.md', '## Escapes\nnone\n')
    const broken = Array.from({ length: 150000 }, () => 'R1.1. broken line')
    put('orchestrate/noisy/review-1.findings.md', findings([...broken, 'VERDICT: clean']))
    const run = readRunMetrics(root)
    expect(run.units.map((unit) => unit.unit)).toEqual(['noisy'])
    expect(run.parseErrors).toHaveLength(150000)
  })

  it('uses the latest listing when an ID is relisted in a different bucket', () => {
    put(
      'orchestrate/budget.md',
      ledger([
        ['relist', 'review-full', '1', '-', 'fix-needed'],
        ['relist', 'review-round', '2', '-', 'clean']
      ])
    )
    put(
      'orchestrate/relist/review-1.findings.md',
      findings([
        'R1.1. a.ts:1 - major - [patch] - logic - first',
        'VERDICT: fix-needed patch=1 decision-needed=0 nit=0 defer=0'
      ])
    )
    put(
      'orchestrate/relist/review-2.findings.md',
      findings(['R1.1. a.ts:1 - minor - [defer] - logic - moved', 'VERDICT: clean'])
    )
    put('orchestrate/retrospective.md', '## Escapes\nnone\n')
    const [unit] = readRunMetrics(root).units
    expect(unit.findings).toEqual({ patch: 0, nit: 0, decisionNeeded: 0, defer: 1 })
  })

  it('does not count an override review toward needs-attention', () => {
    const rows = [
      ['ovr', 'review-full', '1', '-', 'fix-needed'],
      ['ovr', 'review-round', '2', '-', 'fix-needed'],
      ['ovr', 'review-override', '3', '-', 'fix-needed']
    ]
    put('orchestrate/budget.md', ledger(rows))
    for (const token of ['1', '2', '3']) {
      put(
        `orchestrate/ovr/review-${token}.findings.md`,
        findings(['VERDICT: fix-needed patch=0 decision-needed=0 nit=0 defer=0'])
      )
    }
    put('orchestrate/retrospective.md', '## Escapes\nnone\n')
    expect(readRunMetrics(root).units[0]).toMatchObject({ reviews: 3, outcome: 'open' })

    put('orchestrate/budget.md', ledger([...rows, ['ovr', 'review-round', '4', '-', 'fix-needed']]))
    put(
      'orchestrate/ovr/review-4.findings.md',
      findings(['VERDICT: fix-needed patch=0 decision-needed=0 nit=0 defer=0'])
    )
    expect(readRunMetrics(root).units[0]).toMatchObject({ reviews: 4, outcome: 'needs-attention' })
  })
})
