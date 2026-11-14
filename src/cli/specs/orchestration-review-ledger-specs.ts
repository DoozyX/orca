import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli-argument-boundary'
import type { CommandSpec } from '../discovery/command-spec'

const RUN_NOTE =
  'Writes orchestrate/budget.md only and needs no running Orca; --run is a run-directory path here, not a Run id.'

export const ORCHESTRATION_REVIEW_LEDGER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['orchestration', 'ledger-reserve'],
    summary: 'Reserve a review or fix row in a run ledger, or refuse it under the review budget',
    usage:
      'orca orchestration ledger-reserve --run <dir> --unit <slug> --kind <review-full|review-round|review-integration|review-override|fix|fix-override|nit-fix> --base <sha> --head <sha> [--dispatch <id>] [--reason <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'run', 'unit', 'kind', 'base', 'head', 'dispatch', 'reason'],
    notes: [
      RUN_NOTE,
      'Budget per unit: three counted reviews, two counted fixes, one integration review. An override kind needs --reason "decision D<n> ...".',
      'A fix whose --reason starts with "ci:" follows a clean review; any other fix follows a fix-needed review at the same head.'
    ]
  },
  {
    path: ['orchestration', 'ledger-settle'],
    summary: "Settle a unit's reserved ledger row from a findings file or an explicit outcome",
    usage:
      'orca orchestration ledger-settle --run <dir> --unit <slug> (--findings <file> | --outcome <done|invalid|startup-failed>) [--result-sha <sha>] [--dispatch <id>] [--reason <text>] [--no-full-suite] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'run',
      'unit',
      'findings',
      'outcome',
      'result-sha',
      'dispatch',
      'reason',
      'no-full-suite'
    ],
    notes: [
      RUN_NOTE,
      '--findings validates the review file and records clean, fix-needed, or invalid with each problem printed.',
      '--no-full-suite accepts a review without a "Checked: tests full" line, for a run whose verification contract gives the full suite to CI.'
    ]
  }
]
