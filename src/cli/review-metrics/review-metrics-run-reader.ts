import { accessSync, constants, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { countEscapes, parseDispositions } from './review-dispositions-parser'
import { parseFindingsFile, type ParsedFindingsFile } from './review-findings-parser'
import { isLedgerV2, parseLedgerRows, type LedgerRow } from './review-ledger-parser'
import { ReviewMetricsReadError, ReviewMetricsRunDirError } from './review-metrics-errors'
import { computeTotals } from './review-metrics-totals'
import type { RunMetrics } from './review-metrics-types'
import { buildUnitMetrics, type UnitFileSource } from './review-unit-metrics'

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw new ReviewMetricsReadError(path, error instanceof Error ? error.message : String(error))
  }
}

function assertRunDir(runDir: string): void {
  try {
    if (!statSync(runDir).isDirectory()) {
      throw new ReviewMetricsRunDirError(runDir, 'not a directory')
    }
    accessSync(runDir, constants.R_OK | constants.X_OK)
  } catch (error) {
    if (error instanceof ReviewMetricsRunDirError) {
      throw error
    }
    throw new ReviewMetricsRunDirError(
      runDir,
      error instanceof Error ? error.message : String(error)
    )
  }
}

function groupByUnit(rows: readonly LedgerRow[]): Map<string, LedgerRow[]> {
  const units = new Map<string, LedgerRow[]>()
  for (const row of rows) {
    const existing = units.get(row.unit)
    if (existing) {
      existing.push(row)
    } else {
      units.set(row.unit, [row])
    }
  }
  return units
}

export function readRunMetrics(runDir: string): RunMetrics {
  assertRunDir(runDir)
  const parseErrors: string[] = []
  let budget: string | null
  try {
    budget = readIfPresent(join(runDir, 'orchestrate', 'budget.md'))
  } catch (error) {
    if (error instanceof ReviewMetricsReadError) {
      throw new ReviewMetricsRunDirError(runDir, error.message)
    }
    throw error
  }
  if (budget === null || !isLedgerV2(budget)) {
    return {
      run: runDir,
      format: 'unparsed',
      units: [],
      totals: computeTotals([], 0),
      escapes: 0,
      parseErrors
    }
  }

  const findingsCache = new Map<string, ParsedFindingsFile>()
  const unreadable = new Set<string>()
  const readRelative = (relative: string): string | null => {
    try {
      return readIfPresent(join(runDir, ...relative.split('/')))
    } catch (error) {
      if (!(error instanceof ReviewMetricsReadError)) {
        throw error
      }
      unreadable.add(relative)
      parseErrors.push(`${relative}: unreadable (${error.message})`)
      return null
    }
  }
  const missing = (relative: string): string[] =>
    unreadable.has(relative) ? [] : [`${relative}: missing`]
  const source: UnitFileSource = {
    findings(unit, token) {
      const relative = `orchestrate/${unit}/review-${token}.findings.md`
      const cached = findingsCache.get(relative)
      if (cached) {
        return cached
      }
      const text = readRelative(relative)
      const parsed: ParsedFindingsFile =
        text === null
          ? { findings: [], priors: [], errors: missing(relative) }
          : parseFindingsFile(text, relative)
      parseErrors.push(...parsed.errors)
      findingsCache.set(relative, parsed)
      return parsed
    },
    dispositions(unit, token) {
      const relative = `orchestrate/${unit}/fix-${token}.dispositions.md`
      const text = readRelative(relative)
      if (text === null) {
        parseErrors.push(...missing(relative))
        return []
      }
      return parseDispositions(text)
    },
    nitFixDispositions(unit) {
      const text = readRelative(`orchestrate/${unit}/nit-fix.dispositions.md`)
      return text === null ? [] : parseDispositions(text)
    }
  }

  const units = [...groupByUnit(parseLedgerRows(budget))].map(([unit, rows]) =>
    buildUnitMetrics(unit, rows, source)
  )

  const retrospective = readRelative('orchestrate/retrospective.md')
  let escapes = 0
  if (retrospective === null) {
    parseErrors.push(...missing('orchestrate/retrospective.md'))
  } else {
    const counted = countEscapes(retrospective)
    if (counted === null) {
      parseErrors.push('orchestrate/retrospective.md: missing "## Escapes" section')
    } else {
      escapes = counted
    }
  }

  return {
    run: runDir,
    format: 'v2',
    units,
    totals: computeTotals(units, escapes),
    escapes,
    parseErrors
  }
}
