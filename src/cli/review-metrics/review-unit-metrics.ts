import type { ParsedDisposition } from './review-dispositions-parser'
import type { ParsedFindingsFile } from './review-findings-parser'
import {
  isCountedFix,
  isCountedReview,
  isIntegrationReview,
  type LedgerRow
} from './review-ledger-parser'
import type { UnitMetrics } from './review-metrics-types'

export type UnitFileSource = {
  findings(unit: string, reviewToken: string): ParsedFindingsFile
  dispositions(unit: string, fixToken: string): ParsedDisposition[]
  nitFixDispositions(unit: string): ParsedDisposition[]
}

const NEEDS_ATTENTION_REVIEWS = 3

export function buildUnitMetrics(
  unit: string,
  rows: readonly LedgerRow[],
  source: UnitFileSource
): UnitMetrics {
  const buckets = new Map<string, string>()
  const round1Misses = new Set<string>()
  const upheldIds = new Set<string>()
  const gatedIds = new Set<string>()
  const seenReviews = new Set<string>()
  let reviews = 0
  let fixes = 0
  let nonOverrideReviews = 0
  let reviewsToClean: number | null = null
  let latest: string | null = null
  let upheld = 0
  let withdrawn = 0
  let raised = 0
  let nitsFixed = 0
  let nitsRecorded = 0

  function applyDispositions(entries: readonly ParsedDisposition[]): void {
    for (const entry of entries) {
      if (entry.kind === 'disputed') {
        raised += 1
        if (upheldIds.has(entry.id)) {
          gatedIds.add(entry.id)
        }
      } else if (entry.kind === 'nit-fixed') {
        nitsFixed += 1
      } else if (entry.kind === 'nit-skipped') {
        nitsRecorded += 1
      }
    }
  }

  for (const row of rows) {
    const integration = isIntegrationReview(row)
    if (integration || isCountedReview(row)) {
      latest = row.outcome
      const token = integration ? 'I' : row.review
      if (!seenReviews.has(token)) {
        seenReviews.add(token)
        const parsed = source.findings(unit, token)
        for (const finding of parsed.findings) {
          buckets.set(finding.id, finding.bucket)
          if (finding.round1Miss) {
            round1Misses.add(finding.id)
          }
        }
        for (const prior of parsed.priors) {
          if (prior.ruling === 'disputed-upheld') {
            upheld += 1
            upheldIds.add(prior.id)
          } else if (prior.ruling === 'disputed-withdrawn') {
            withdrawn += 1
          }
        }
      }
      if (!integration) {
        reviews += 1
        if (row.kind !== 'review-override') {
          nonOverrideReviews += 1
        }
        if (row.outcome === 'clean' && reviewsToClean === null) {
          reviewsToClean = reviews
        }
      }
    } else if (isCountedFix(row)) {
      fixes += 1
      applyDispositions(source.dispositions(unit, row.fix))
    }
  }
  applyDispositions(source.nitFixDispositions(unit))

  const bucketCount = (bucket: string): number =>
    [...buckets.values()].filter((value) => value === bucket).length
  const outcome =
    latest === 'clean'
      ? 'clean'
      : latest === 'fix-needed' && nonOverrideReviews >= NEEDS_ATTENTION_REVIEWS
        ? 'needs-attention'
        : 'open'

  return {
    unit,
    reviews,
    fixes,
    outcome,
    reviewsToClean,
    findings: {
      patch: bucketCount('patch'),
      nit: bucketCount('nit'),
      decisionNeeded: bucketCount('decision-needed'),
      defer: bucketCount('defer')
    },
    round1Misses: round1Misses.size,
    disputes: { raised, upheld, withdrawn, gated: gatedIds.size },
    nits: { fixed: nitsFixed, recorded: nitsRecorded }
  }
}
