import type {
  WorkerTerminalRetainedReason,
  WorkerTerminalTakeoverEvidence
} from '../../../../orchestration/worker-terminal-ownership'

export type WorkerReleaseReceipt = {
  dispatchId: string
  state: 'released' | 'already_released' | 'retained' | 'release_pending' | 'release_unknown'
  reason?: WorkerTerminalRetainedReason
  processAction: 'closed_agent_terminal' | 'closed_exited_terminal' | 'none'
  archive: { source: string | null; status: string | null } | null
  recovery?: string
  lastError?: string
  /** The input that took the terminal over, on a receipt retained for a user takeover. */
  takeover?: WorkerTerminalTakeoverEvidence
}
