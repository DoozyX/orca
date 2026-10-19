import type { Totals, UnitMetrics } from './review-metrics-types'

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function computeTotals(units: readonly UnitMetrics[], escapes: number): Totals {
  const counted = units.filter((unit) => unit.reviews >= 1)
  const cleaned = counted.flatMap((unit) =>
    unit.reviewsToClean === null ? [] : [unit.reviewsToClean]
  )
  const patch = counted.reduce((sum, unit) => sum + unit.findings.patch, 0)
  const withdrawn = counted.reduce((sum, unit) => sum + unit.disputes.withdrawn, 0)
  const pct = (count: number): number | null =>
    counted.length === 0 ? null : round((count / counted.length) * 100, 1)
  return {
    units: counted.length,
    meanReviewsToClean:
      cleaned.length === 0
        ? null
        : round(cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length, 2),
    cleanByReview2Pct: pct(cleaned.filter((value) => value <= 2).length),
    threePlusPct: pct(counted.filter((unit) => unit.reviews >= 3).length),
    patchPrecision: patch === 0 ? null : round(1 - withdrawn / patch, 3),
    round1Misses: counted.reduce((sum, unit) => sum + unit.round1Misses, 0),
    escapes
  }
}
