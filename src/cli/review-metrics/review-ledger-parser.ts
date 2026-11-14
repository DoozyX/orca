export type LedgerRow = {
  unit: string
  kind: string
  review: string
  fix: string
  baseSha: string
  headSha: string
  resultSha: string
  dispatch: string
  outcome: string
  reason: string
  /** Zero-based line of the row in budget.md. */
  line: number
}

export const LEDGER_FORMAT_LINE = 'ledger-format: 2'

export const LEDGER_COLUMNS = [
  'unit',
  'kind',
  'review#',
  'fix#',
  'base-sha',
  'head-sha',
  'result-sha',
  'dispatch',
  'outcome',
  'reason'
]

/** `end` is the first line after the table, or -1 when the header row is missing. */
export type ParsedLedger = { rows: LedgerRow[]; errors: string[]; end: number }

const LEDGER_PATH = 'orchestrate/budget.md'
export const REVIEW_KINDS = new Set([
  'review-full',
  'review-round',
  'review-override',
  'review-integration'
])
export const FIX_KINDS = new Set(['fix', 'fix-override', 'nit-fix'])
const COUNTED_REVIEW_KINDS = new Set(['review-full', 'review-round', 'review-override'])
const COUNTED_FIX_KINDS = new Set(['fix', 'fix-override'])
const UNSETTLED_OUTCOMES = new Set(['reserved', 'invalid', 'startup-failed'])
const REVIEW_OUTCOMES = new Set([...UNSETTLED_OUTCOMES, 'clean', 'fix-needed'])
const FIX_OUTCOMES = new Set([...UNSETTLED_OUTCOMES, 'done'])

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

export function isLedgerV2(budgetText: string): boolean {
  const first = budgetText.split(/\r?\n/).find((line) => line.trim().length > 0)
  return first === LEDGER_FORMAT_LINE
}

function rowError(row: Pick<LedgerRow, 'kind' | 'outcome'>): string | null {
  const allowed = REVIEW_KINDS.has(row.kind)
    ? REVIEW_OUTCOMES
    : FIX_KINDS.has(row.kind)
      ? FIX_OUTCOMES
      : null
  if (allowed === null) {
    return `unknown kind "${row.kind}"`
  }
  if (!allowed.has(row.outcome) && !row.outcome.startsWith('quota@')) {
    return `outcome "${row.outcome}" is not valid for kind ${row.kind}`
  }
  return null
}

export function parseLedger(budgetText: string): ParsedLedger {
  const lines = budgetText.split(/\r?\n/)
  const header = lines.findIndex((line) => splitRow(line).join('|') === LEDGER_COLUMNS.join('|'))
  if (header === -1) {
    return { rows: [], errors: [`${LEDGER_PATH}: missing ledger header row`], end: -1 }
  }
  const result: ParsedLedger = { rows: [], errors: [], end: -1 }
  let index = header + 1
  for (; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim().startsWith('|')) {
      break
    }
    const cells = splitRow(line)
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
      continue
    }
    if (cells.length !== LEDGER_COLUMNS.length) {
      result.errors.push(
        `${LEDGER_PATH}:${index + 1}: expected ${LEDGER_COLUMNS.length} cells, got ${cells.length}`
      )
      continue
    }
    const row = {
      unit: cells[0],
      kind: cells[1],
      review: cells[2],
      fix: cells[3],
      baseSha: cells[4],
      headSha: cells[5],
      resultSha: cells[6],
      dispatch: cells[7],
      outcome: cells[8],
      reason: cells[9],
      line: index
    }
    const error = rowError(row)
    if (error !== null) {
      result.errors.push(`${LEDGER_PATH}:${index + 1}: ${error}`)
    }
    result.rows.push(row)
  }
  result.end = index
  // Why: a blank line inside the table silently drops every later row from the counts.
  for (; index < lines.length && !lines[index].trim().startsWith('#'); index++) {
    if (lines[index].trim().startsWith('|')) {
      result.errors.push(
        `${LEDGER_PATH}:${index + 1}: ledger row after a break in the table is not counted`
      )
    }
  }
  return result
}

function hasReviewVerdict(row: LedgerRow): boolean {
  return row.outcome === 'clean' || row.outcome === 'fix-needed'
}

export function isCountedReview(row: LedgerRow): boolean {
  return COUNTED_REVIEW_KINDS.has(row.kind) && hasReviewVerdict(row)
}

export function isIntegrationReview(row: LedgerRow): boolean {
  return row.kind === 'review-integration' && hasReviewVerdict(row)
}

export function isCountedFix(row: LedgerRow): boolean {
  return (
    COUNTED_FIX_KINDS.has(row.kind) &&
    !UNSETTLED_OUTCOMES.has(row.outcome) &&
    !row.outcome.startsWith('quota@')
  )
}
