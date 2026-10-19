import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_HANDLERS } from '../handlers/orchestration'
import { ReviewMetricsRunDirError } from './review-metrics-errors'
import { readRunMetrics } from './review-metrics-run-reader'
import type { ReviewMetrics } from './review-metrics-types'
import {
  buildV2Run,
  emptyTotals,
  expectedTotals,
  expectedUnits,
  findings,
  ledger
} from './review-metrics-v2-fixture'

describe('review-metrics', () => {
  let root: string
  let logged: string[]

  function put(rel: string, text: string): void {
    const path = join(root, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-review-metrics-'))
    logged = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      logged.push(String(chunk))
      return true
    })
    process.exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
    process.exitCode = undefined
  })

  async function runHandler(runs: string[], json = true): Promise<void> {
    await ORCHESTRATION_HANDLERS['orchestration review-metrics']({
      flags: new Map<string, string | boolean>([['run', runs.join('\u0000')]]),
      get client(): never {
        throw new Error('review-metrics must not touch the runtime client')
      },
      cwd: root,
      json
    })
  }

  it('computes hand-counted metrics for a v2 run', () => {
    buildV2Run(put)
    expect(readRunMetrics(root)).toEqual({
      run: root,
      format: 'v2',
      units: expectedUnits,
      totals: expectedTotals,
      escapes: 1,
      parseErrors: []
    })
  })

  it('reports a run without ledger-format: 2 as unparsed', () => {
    put('orchestrate/budget.md', '\n# Budget\n| unit | rework |\n')
    expect(readRunMetrics(root)).toEqual({
      run: root,
      format: 'unparsed',
      units: [],
      totals: emptyTotals,
      escapes: 0,
      parseErrors: []
    })
  })

  it('reports a run with no budget.md as unparsed', () => {
    expect(readRunMetrics(root).format).toBe('unparsed')
  })

  it('records a missing findings file as a parse error and fails the exit code', async () => {
    put('orchestrate/budget.md', ledger([['solo', 'review-full', '1', '-', 'clean']]))
    put('orchestrate/retrospective.md', '## Escapes\nnone\n')
    expect(readRunMetrics(root).parseErrors).toEqual([
      'orchestrate/solo/review-1.findings.md: missing'
    ])
    await runHandler([root])
    expect(process.exitCode).toBe(1)
    expect(JSON.parse(logged.join('')).runs[0].parseErrors).toHaveLength(1)
  })

  it('records malformed findings and a missing retrospective as parse errors', () => {
    put('orchestrate/budget.md', ledger([['solo', 'review-full', '1', '-', 'clean']]))
    put(
      'orchestrate/solo/review-1.findings.md',
      findings(['R1.1. broken line', 'Prior: R1.1 - nonsense'])
    )
    expect(readRunMetrics(root).parseErrors).toEqual([
      'orchestrate/solo/review-1.findings.md: unparseable line "R1.1. broken line"',
      'orchestrate/solo/review-1.findings.md: unparseable line "Prior: R1.1 - nonsense"',
      'orchestrate/solo/review-1.findings.md: missing VERDICT line',
      'orchestrate/retrospective.md: missing'
    ])
  })

  it('prints the JSON for a clean v2 run without failing the exit code', async () => {
    buildV2Run(put)
    await runHandler([root])
    const output: ReviewMetrics = JSON.parse(logged.join(''))
    expect(output.runs).toHaveLength(1)
    expect(output.totals).toEqual(expectedTotals)
    expect(process.exitCode).toBeUndefined()
  })

  it('prints a text table with a run totals row and an all-runs totals row', async () => {
    buildV2Run(put)
    await runHandler([root], false)
    const text = logged.join('')
    expect(text).toContain('gamma')
    expect(text).toContain('needs-attention')
    expect(text.match(/TOTAL/g)).toHaveLength(1)
    expect(text).toContain('ALL RUNS')
  })

  it('throws the typed error for a missing run directory', async () => {
    await expect(runHandler([join(root, 'missing')])).rejects.toBeInstanceOf(
      ReviewMetricsRunDirError
    )
  })
})
