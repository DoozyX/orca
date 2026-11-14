import {
  FIX_KINDS,
  isCountedFix,
  isCountedReview,
  isIntegrationReview,
  REVIEW_KINDS,
  type LedgerRow
} from '../review-metrics/review-ledger-parser'

export const MAX_COUNTED_REVIEWS = 3
export const MAX_COUNTED_FIXES = 2
const MAX_ATTEMPTS_AFTER_STARTUP_FAILURE = 3
const MAX_ATTEMPTS_AFTER_INVALID = 2

export type LedgerKind =
  | 'review-full'
  | 'review-round'
  | 'review-integration'
  | 'review-override'
  | 'fix'
  | 'fix-override'
  | 'nit-fix'

export type LedgerRequest = {
  unit: string
  kind: LedgerKind
  baseSha: string
  headSha: string
  reason: string
}

export type LedgerNumbering = { review: string; fix: string }

export function isLedgerKind(value: string): value is LedgerKind {
  return REVIEW_KINDS.has(value) || FIX_KINDS.has(value)
}

// Why: coordinators paste abbreviated and full shas for the same commit.
function sameSha(left: string, right: string): boolean {
  return left.length > 0 && right.length > 0 && (left.startsWith(right) || right.startsWith(left))
}

function isBudgetedReview(row: LedgerRow): boolean {
  return isCountedReview(row) && row.kind !== 'review-override'
}

function isBudgetedFix(row: LedgerRow): boolean {
  return isCountedFix(row) && row.kind !== 'fix-override'
}

function last<T>(items: readonly T[]): T | undefined {
  return items.at(-1)
}

function trailingAttempts(rows: readonly LedgerRow[], kind: string, outcome: string): number {
  let count = 0
  for (let index = rows.length - 1; index >= 0; index--) {
    if (rows[index].kind !== kind || rows[index].outcome !== outcome) {
      break
    }
    count += 1
  }
  return count
}

function isDecisionReason(reason: string): boolean {
  return /^decision D\d+\b/.test(reason)
}

function reviewRefusal(
  request: LedgerRequest,
  reviews: readonly LedgerRow[],
  fixes: readonly LedgerRow[],
  rows: readonly LedgerRow[]
): string | null {
  const latestVerdict = last(rows.filter((row) => isCountedReview(row) || isIntegrationReview(row)))
  if (
    latestVerdict?.outcome === 'clean' &&
    sameSha(latestVerdict.baseSha, request.baseSha) &&
    sameSha(latestVerdict.headSha, request.headSha)
  ) {
    return 'already clean at this base and head: proceed to landing'
  }
  if (request.kind === 'review-full') {
    return reviews.length === 0 ? null : 'review #1 already counted: use review-round'
  }
  if (request.kind === 'review-integration') {
    if (rows.some((row) => row.kind === 'review-integration' && row.outcome !== 'invalid')) {
      return 'the one integration review is already used: needs-attention'
    }
    const lastClean = last(reviews.filter((row) => row.outcome === 'clean'))
    if (lastClean === undefined || sameSha(lastClean.baseSha, request.baseSha)) {
      return 'an integration review needs a clean review on a different base-sha'
    }
    return request.reason.length > 0 ? null : '--reason must name the material integration change'
  }
  if (reviews.length === 0) {
    return 'no counted review yet: review #1 is review-full'
  }
  if (!sameSha(reviews[0].baseSha, request.baseSha)) {
    return `base-sha differs from review #1's ${reviews[0].baseSha}`
  }
  const lastFix = last(fixes)
  if (lastFix !== undefined && !sameSha(lastFix.resultSha, request.headSha)) {
    return `stale HEAD: the last counted fix ended at ${lastFix.resultSha}; find the unrecorded commits`
  }
  if (request.kind === 'review-override') {
    return isDecisionReason(request.reason) ? null : '--reason must start with "decision D<n>"'
  }
  return reviews.filter(isBudgetedReview).length < MAX_COUNTED_REVIEWS
    ? null
    : `review budget spent (${MAX_COUNTED_REVIEWS}): needs-attention, or record a decision and use review-override`
}

function fixRefusal(
  request: LedgerRequest,
  fixes: readonly LedgerRow[],
  rows: readonly LedgerRow[]
): string | null {
  const latestVerdict = last(rows.filter((row) => isCountedReview(row) || isIntegrationReview(row)))
  if (latestVerdict === undefined) {
    return 'no counted review yet'
  }
  if (request.kind === 'nit-fix') {
    return latestVerdict.outcome === 'clean' ? null : 'nit-fix follows a clean review'
  }
  const ciFix = request.reason.startsWith('ci:')
  if (ciFix && latestVerdict.outcome !== 'clean') {
    return 'a ci: fix follows a clean review'
  }
  if (!ciFix && latestVerdict.outcome !== 'fix-needed') {
    return 'the latest counted review is not fix-needed: re-review first'
  }
  const lastFix = last(fixes)
  const reviewedAfterLastFix =
    lastFix === undefined || rows.indexOf(latestVerdict) > rows.indexOf(lastFix)
  if (!ciFix && !reviewedAfterLastFix) {
    return 'the last fix has no review yet: re-review first'
  }
  if (!ciFix && !sameSha(latestVerdict.headSha, request.headSha)) {
    return `head-sha differs from the reviewed ${latestVerdict.headSha}: re-review first`
  }
  if (request.kind === 'fix-override') {
    return isDecisionReason(request.reason) ? null : '--reason must start with "decision D<n>"'
  }
  return fixes.filter(isBudgetedFix).length < MAX_COUNTED_FIXES
    ? null
    : `fix budget spent (${MAX_COUNTED_FIXES}): needs-attention, or record a decision and use fix-override`
}

/** Why a new row must not be reserved, or null when the budget rules allow it. */
export function ledgerRefusal(
  request: LedgerRequest,
  unitRows: readonly LedgerRow[]
): string | null {
  if (unitRows.some((row) => row.outcome === 'reserved')) {
    return 'a reserved row is still open: settle it first'
  }
  if (
    trailingAttempts(unitRows, request.kind, 'startup-failed') >= MAX_ATTEMPTS_AFTER_STARTUP_FAILURE
  ) {
    return 'startup failed three times: needs-attention'
  }
  if (trailingAttempts(unitRows, request.kind, 'invalid') >= MAX_ATTEMPTS_AFTER_INVALID) {
    return 'two invalid results in a row: needs-attention'
  }
  const reviews = unitRows.filter(isCountedReview)
  const fixes = unitRows.filter(isCountedFix)
  return REVIEW_KINDS.has(request.kind)
    ? reviewRefusal(request, reviews, fixes, unitRows)
    : fixRefusal(request, fixes, unitRows)
}

export function ledgerNumbering(kind: LedgerKind, unitRows: readonly LedgerRow[]): LedgerNumbering {
  const reviews = unitRows.filter(isCountedReview).length
  const fixes = unitRows.filter(isCountedFix).length
  if (kind === 'review-integration') {
    return { review: 'I', fix: '-' }
  }
  if (kind === 'nit-fix') {
    return { review: '-', fix: '-' }
  }
  return REVIEW_KINDS.has(kind)
    ? { review: String(reviews + 1), fix: '-' }
    : { review: '-', fix: String(fixes + 1) }
}

export function budgetSummary(unitRows: readonly LedgerRow[]): string {
  const reviews = unitRows.filter(isBudgetedReview).length
  const fixes = unitRows.filter(isBudgetedFix).length
  return `reviews ${reviews}/${MAX_COUNTED_REVIEWS} fixes ${fixes}/${MAX_COUNTED_FIXES}`
}
