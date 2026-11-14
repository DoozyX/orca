import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CommandHandler } from '../dispatch/dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../arguments/flags'
import { writeStdoutLine } from '../output/stdout-line'
import { RuntimeClientError } from '../runtime/types'
import { parseFindingsFile } from '../review-metrics/review-findings-parser'
import { REVIEW_KINDS, type LedgerRow } from '../review-metrics/review-ledger-parser'
import {
  budgetSummary,
  isLedgerKind,
  ledgerNumbering,
  ledgerRefusal
} from '../review-ledger/review-budget-rules'
import {
  ReviewLedgerFileError,
  ReviewLedgerRefusedError
} from '../review-ledger/review-ledger-errors'
import { appendLedgerRow, openLedger, replaceLedgerRow } from '../review-ledger/review-ledger-file'
import { settleReview } from '../review-ledger/review-verdict-validation'

const STARTED = /started=(\S+)/
const DIRECT_OUTCOMES = ['done', 'invalid', 'startup-failed']

type Settled = { outcome: string; reason: string; problems: string[] }

function readFindings(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // Why: a review that wrote no findings file is an invalid round, not a CLI failure.
      return ''
    }
    throw new ReviewLedgerFileError(path, error instanceof Error ? error.message : String(error))
  }
}

function settleFromFindings(path: string, fullSuiteRequired: boolean): Settled {
  const settlement = settleReview(parseFindingsFile(readFindings(path), path), {
    fullSuiteRequired
  })
  if (settlement.outcome === 'invalid') {
    return {
      outcome: 'invalid',
      reason: settlement.problems.join('; '),
      problems: settlement.problems
    }
  }
  const { patch, nit, defer } = settlement.counts
  return {
    outcome: settlement.outcome,
    reason: `patch=${patch} decision-needed=${settlement.counts['decision-needed']} nit=${nit} defer=${defer}`,
    problems: []
  }
}

function tookMinutes(reason: string, now: Date): string {
  const started = STARTED.exec(reason)
  if (started === null) {
    return ''
  }
  const minutes = Math.round((now.getTime() - Date.parse(started[1])) / 60_000)
  return Number.isFinite(minutes) ? `took=${minutes}m` : ''
}

function joinReason(...parts: string[]): string {
  return parts.filter((part) => part.length > 0 && part !== '-').join(' ; ')
}

function nextStep(row: LedgerRow, unitRows: readonly LedgerRow[]): string {
  if (row.outcome === 'invalid' || row.outcome === 'startup-failed') {
    return 'reserve the same kind again to retry; the ledger refuses when retries are spent'
  }
  if (row.outcome === 'clean') {
    return 'land the unit; list its nit and defer items'
  }
  if (row.outcome === 'fix-needed') {
    const fix = ledgerRefusal({ ...row, kind: 'fix', reason: '' }, unitRows)
    return fix === null ? 'reserve a fix' : `needs-attention (${fix})`
  }
  return 'reserve the next review'
}

export const ORCHESTRATION_REVIEW_LEDGER_HANDLERS: Record<string, CommandHandler> = {
  'orchestration ledger-reserve': async ({ flags, cwd, json }) => {
    const unit = getRequiredStringFlag(flags, 'unit')
    const kind = getRequiredStringFlag(flags, 'kind')
    if (!isLedgerKind(kind)) {
      throw new RuntimeClientError('invalid_argument', `Unknown --kind ${kind}`)
    }
    const request = {
      unit,
      kind,
      baseSha: getRequiredStringFlag(flags, 'base'),
      headSha: getRequiredStringFlag(flags, 'head'),
      reason: getOptionalStringFlag(flags, 'reason') ?? ''
    }
    const ledger = openLedger(resolve(cwd, getRequiredStringFlag(flags, 'run')))
    const unitRows = ledger.rows.filter((row) => row.unit === unit)
    const refusal = ledgerRefusal(request, unitRows)
    if (refusal !== null) {
      throw new ReviewLedgerRefusedError(unit, refusal)
    }
    const row = {
      ...request,
      ...ledgerNumbering(kind, unitRows),
      resultSha: '-',
      dispatch: getOptionalStringFlag(flags, 'dispatch') ?? '-',
      outcome: 'reserved',
      reason: joinReason(request.reason, `started=${new Date().toISOString()}`)
    }
    appendLedgerRow(ledger, row)
    const budget = budgetSummary(unitRows)
    writeStdoutLine(
      json
        ? JSON.stringify({ ledger: ledger.path, row, budget }, null, 2)
        : `reserved ${unit} ${kind} review#=${row.review} fix#=${row.fix} | counted so far: ${budget}`
    )
  },

  'orchestration ledger-settle': async ({ flags, cwd, json }) => {
    const unit = getRequiredStringFlag(flags, 'unit')
    const ledger = openLedger(resolve(cwd, getRequiredStringFlag(flags, 'run')))
    const unitRows = ledger.rows.filter((row) => row.unit === unit)
    const reserved = unitRows.find((row) => row.outcome === 'reserved')
    if (reserved === undefined) {
      throw new ReviewLedgerRefusedError(unit, 'no reserved row to settle')
    }
    const findings = getOptionalStringFlag(flags, 'findings')
    const direct = getOptionalStringFlag(flags, 'outcome')
    const isReview = REVIEW_KINDS.has(reserved.kind)
    if ((findings === undefined) === (direct === undefined)) {
      throw new RuntimeClientError('invalid_argument', 'Pass exactly one of --findings, --outcome')
    }
    let settled: Settled
    if (findings !== undefined) {
      if (!isReview) {
        throw new RuntimeClientError(
          'invalid_argument',
          `--findings settles a review, not a ${reserved.kind}`
        )
      }
      settled = settleFromFindings(resolve(cwd, findings), flags.get('no-full-suite') !== true)
    } else if (
      direct === undefined ||
      !DIRECT_OUTCOMES.includes(direct) ||
      (isReview && direct === 'done')
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        isReview
          ? 'A review settles with --findings, or --outcome invalid|startup-failed'
          : `--outcome is one of ${DIRECT_OUTCOMES.join(', ')}`
      )
    } else {
      settled = { outcome: direct, reason: '', problems: [] }
    }
    const resultSha = getOptionalStringFlag(flags, 'result-sha')
    if (settled.outcome === 'done' && resultSha === undefined) {
      throw new RuntimeClientError('invalid_argument', 'A done fix needs --result-sha')
    }
    const verdictReached = settled.outcome === 'clean' || settled.outcome === 'fix-needed'
    const row: LedgerRow = {
      ...reserved,
      resultSha: resultSha ?? (verdictReached ? reserved.headSha : '-'),
      dispatch: getOptionalStringFlag(flags, 'dispatch') ?? reserved.dispatch,
      outcome: settled.outcome,
      reason: joinReason(
        reserved.reason
          .replace(STARTED, '')
          .replace(/\s*;\s*$/, '')
          .trim(),
        getOptionalStringFlag(flags, 'reason') ?? '',
        settled.reason,
        tookMinutes(reserved.reason, new Date())
      )
    }
    replaceLedgerRow(ledger, row)
    const after = unitRows.map((existing) => (existing === reserved ? row : existing))
    const budget = budgetSummary(after)
    const next = nextStep(row, after)
    if (json) {
      writeStdoutLine(
        JSON.stringify(
          { ledger: ledger.path, row, problems: settled.problems, budget, next },
          null,
          2
        )
      )
      return
    }
    writeStdoutLine(`settled ${unit} ${row.kind}: ${row.outcome} | ${budget} | next: ${next}`)
    for (const problem of settled.problems) {
      writeStdoutLine(`  invalid: ${problem}`)
    }
  }
}
