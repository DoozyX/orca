export type LedgerRow = {
  unit: string
  kind: string
  review: string
  fix: string
  outcome: string
}

const LEDGER_COLUMNS = [
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

const COUNTED_REVIEW_KINDS = new Set(['review-full', 'review-round', 'review-override'])
const COUNTED_FIX_KINDS = new Set(['fix', 'fix-override'])
const UNCOUNTED_FIX_OUTCOMES = new Set(['reserved', 'invalid', 'startup-failed'])

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
  return first === 'ledger-format: 2'
}

export function parseLedgerRows(budgetText: string): LedgerRow[] {
  const lines = budgetText.split(/\r?\n/)
  const header = lines.findIndex((line) => splitRow(line).join('|') === LEDGER_COLUMNS.join('|'))
  if (header === -1) {
    return []
  }
  const rows: LedgerRow[] = []
  for (const line of lines.slice(header + 1)) {
    if (!line.trim().startsWith('|')) {
      break
    }
    const cells = splitRow(line)
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
      continue
    }
    rows.push({
      unit: cells[0],
      kind: cells[1],
      review: cells[2],
      fix: cells[3],
      outcome: cells[8]
    })
  }
  return rows
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
    !UNCOUNTED_FIX_OUTCOMES.has(row.outcome) &&
    !row.outcome.startsWith('quota@')
  )
}
