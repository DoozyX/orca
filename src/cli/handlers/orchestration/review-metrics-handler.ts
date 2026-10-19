import { resolve } from 'node:path'
import { reportCliError } from '../../cli-error'
import type { CommandHandler } from '../../dispatch'
import { getRepeatedStringFlag } from '../../flags'
import { RuntimeClientError } from '../../runtime-client'
import { writeStdoutLine } from '../../stdout-line'
import { ReviewMetricsRunDirError } from '../../review-metrics/review-metrics-errors'
import { readRunMetrics } from '../../review-metrics/review-metrics-run-reader'
import { formatReviewMetricsText } from '../../review-metrics/review-metrics-text'
import { computeTotals } from '../../review-metrics/review-metrics-totals'
import type { ReviewMetrics, RunMetrics } from '../../review-metrics/review-metrics-types'

export const ORCHESTRATION_REVIEW_METRICS_HANDLER: Record<string, CommandHandler> = {
  'orchestration review-metrics': async ({ flags, cwd, json }) => {
    const runDirs = getRepeatedStringFlag(flags, 'run')
    if (runDirs.length === 0) {
      throw new RuntimeClientError('invalid_argument', 'Missing required --run <dir>')
    }
    const runs: RunMetrics[] = []
    const dirErrors: ReviewMetricsRunDirError[] = []
    for (const runDir of runDirs) {
      try {
        runs.push({ ...readRunMetrics(resolve(cwd, runDir)), run: runDir })
      } catch (error) {
        if (!(error instanceof ReviewMetricsRunDirError)) {
          throw error
        }
        dirErrors.push(error)
      }
    }
    if (runs.length > 0) {
      const escapes = runs.reduce((sum, run) => sum + run.escapes, 0)
      const metrics: ReviewMetrics = {
        runs,
        totals: computeTotals(
          runs.flatMap((run) => run.units),
          escapes
        )
      }
      writeStdoutLine(json ? JSON.stringify(metrics, null, 2) : formatReviewMetricsText(metrics))
    }
    if (runs.length === 0 && dirErrors.length > 0) {
      for (const error of dirErrors.slice(1)) {
        reportCliError(error, false)
      }
      throw dirErrors[0]
    }
    // Why: stdout already holds the one ReviewMetrics object, so --json errors still go to stderr.
    for (const error of dirErrors) {
      reportCliError(error, false)
    }
    if (dirErrors.length > 0 || runs.some((run) => run.parseErrors.length > 0)) {
      process.exitCode = 1
    }
  }
}
