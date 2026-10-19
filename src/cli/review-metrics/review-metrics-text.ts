import type { ReviewMetrics, Totals, UnitMetrics } from './review-metrics-types'

const COLUMNS = [
  'unit',
  'reviews',
  'fixes',
  'outcome',
  'to-clean',
  'patch/nit/dec/defer',
  'r1-miss',
  'disputes r/u/w/g',
  'nits fixed/rec'
]

function cell(value: number | null, suffix = ''): string {
  return value === null ? 'n/a' : `${value}${suffix}`
}

function unitCells(unit: UnitMetrics): string[] {
  const { findings, disputes, nits } = unit
  return [
    unit.unit,
    String(unit.reviews),
    String(unit.fixes),
    unit.outcome,
    cell(unit.reviewsToClean),
    `${findings.patch}/${findings.nit}/${findings.decisionNeeded}/${findings.defer}`,
    String(unit.round1Misses),
    `${disputes.raised}/${disputes.upheld}/${disputes.withdrawn}/${disputes.gated}`,
    `${nits.fixed}/${nits.recorded}`
  ]
}

function table(units: readonly UnitMetrics[]): string[] {
  const rows = [COLUMNS, ...units.map(unitCells)]
  const widths = COLUMNS.map((_, index) =>
    rows.reduce((width, row) => Math.max(width, row[index].length), 0)
  )
  return rows.map((row) =>
    row
      .map((value, index) => value.padEnd(widths[index]))
      .join('  ')
      .trimEnd()
  )
}

function totalsRow(label: string, totals: Totals): string {
  return [
    label,
    `units=${totals.units}`,
    `mean-to-clean=${cell(totals.meanReviewsToClean)}`,
    `clean-by-2=${cell(totals.cleanByReview2Pct, '%')}`,
    `3+=${cell(totals.threePlusPct, '%')}`,
    `patch-precision=${cell(totals.patchPrecision)}`,
    `r1-misses=${totals.round1Misses}`,
    `escapes=${totals.escapes}`
  ].join(' ')
}

export function formatReviewMetricsText(metrics: ReviewMetrics): string {
  const lines: string[] = []
  for (const run of metrics.runs) {
    lines.push(`Run ${run.run} (${run.format})`)
    if (run.format === 'v2') {
      for (const row of table(run.units)) {
        lines.push(row)
      }
      lines.push(totalsRow('TOTAL', run.totals))
    }
    if (run.parseErrors.length > 0) {
      lines.push('Parse errors:')
      for (const error of run.parseErrors) {
        lines.push(`  ${error}`)
      }
    }
    lines.push('')
  }
  lines.push(totalsRow('ALL RUNS', metrics.totals))
  return lines.join('\n')
}
