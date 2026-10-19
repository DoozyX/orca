export type Totals = {
  units: number
  meanReviewsToClean: number | null
  cleanByReview2Pct: number | null
  threePlusPct: number | null
  patchPrecision: number | null
  round1Misses: number
  escapes: number
}

export type UnitMetrics = {
  unit: string
  reviews: number
  fixes: number
  outcome: 'clean' | 'needs-attention' | 'open'
  reviewsToClean: number | null
  findings: { patch: number; nit: number; decisionNeeded: number; defer: number }
  round1Misses: number
  disputes: { raised: number; upheld: number; withdrawn: number; gated: number }
  nits: { fixed: number; recorded: number }
}

export type RunMetrics = {
  run: string
  format: 'v2' | 'unparsed'
  units: UnitMetrics[]
  totals: Totals
  escapes: number
  parseErrors: string[]
}

export type ReviewMetrics = { runs: RunMetrics[]; totals: Totals }
