import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const ORCHESTRATION_REVIEW_METRICS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['orchestration', 'review-metrics'],
    summary: 'Summarize review and fix rounds from orchestration run directories',
    usage: 'orca orchestration review-metrics --run <dir> [--run <dir> ...] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'run'],
    repeatableFlags: ['run'],
    notes: [
      'Reads files only and needs no running Orca; --run is a run-directory path here, not a Run id.',
      'Runs whose orchestrate/budget.md does not start with `ledger-format: 2` are reported as unparsed.',
      'Prints everything that parsed, then exits non-zero on any parse error or unreadable directory.'
    ]
  }
]
