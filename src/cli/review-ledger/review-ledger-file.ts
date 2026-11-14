import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  isLedgerV2,
  LEDGER_COLUMNS,
  LEDGER_FORMAT_LINE,
  parseLedger,
  type LedgerRow
} from '../review-metrics/review-ledger-parser'
import { ReviewLedgerFileError } from './review-ledger-errors'

export type LedgerFile = { path: string; lines: string[]; rows: LedgerRow[]; end: number }

function emptyLedgerText(): string {
  const header = `| ${LEDGER_COLUMNS.join(' | ')} |`
  const rule = `| ${LEDGER_COLUMNS.map(() => '---').join(' | ')} |`
  return `${LEDGER_FORMAT_LINE}\n\n${header}\n${rule}\n`
}

function readOrStart(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return emptyLedgerText()
    }
    throw new ReviewLedgerFileError(path, error instanceof Error ? error.message : String(error))
  }
}

export function openLedger(runDir: string): LedgerFile {
  try {
    if (!statSync(runDir).isDirectory()) {
      throw new ReviewLedgerFileError(runDir, 'not a directory')
    }
  } catch (error) {
    if (error instanceof ReviewLedgerFileError) {
      throw error
    }
    throw new ReviewLedgerFileError(runDir, error instanceof Error ? error.message : String(error))
  }
  const path = join(runDir, 'orchestrate', 'budget.md')
  const text = readOrStart(path)
  if (!isLedgerV2(text)) {
    throw new ReviewLedgerFileError(path, `first line is not "${LEDGER_FORMAT_LINE}"`)
  }
  const parsed = parseLedger(text)
  if (parsed.errors.length > 0) {
    // Why: appending to a table the metrics reader cannot count would hide the damage.
    throw new ReviewLedgerFileError(path, `repair the ledger first: ${parsed.errors.join('; ')}`)
  }
  return { path, lines: text.split(/\r?\n/), rows: parsed.rows, end: parsed.end }
}

// Why: a pipe or newline inside a cell would split the row for every later reader.
function cell(value: string): string {
  const flat = value.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()
  return flat.length > 0 ? flat : '-'
}

function formatRow(row: Omit<LedgerRow, 'line'>): string {
  const cells = [
    row.unit,
    row.kind,
    row.review,
    row.fix,
    row.baseSha,
    row.headSha,
    row.resultSha,
    row.dispatch,
    row.outcome,
    row.reason
  ]
  return `| ${cells.map(cell).join(' | ')} |`
}

function write(ledger: LedgerFile): void {
  mkdirSync(dirname(ledger.path), { recursive: true })
  writeFileSync(ledger.path, ledger.lines.join('\n'))
}

export function appendLedgerRow(ledger: LedgerFile, row: Omit<LedgerRow, 'line'>): void {
  ledger.lines.splice(ledger.end, 0, formatRow(row))
  write(ledger)
}

export function replaceLedgerRow(ledger: LedgerFile, row: LedgerRow): void {
  ledger.lines[row.line] = formatRow(row)
  write(ledger)
}
