import type {
  WorkerTerminalResourceRow,
  WorkerTerminalRetainedReason
} from '../../../../orchestration/worker-terminal-ownership'

export function retainedReason(resource: WorkerTerminalResourceRow): WorkerTerminalRetainedReason {
  if (resource.retained_reason) {
    // SAFETY: retained_reason is only ever written from WorkerTerminalRetainedReason values.
    return resource.retained_reason as WorkerTerminalRetainedReason
  }
  if (resource.ownership_state === 'user_owned') {
    return 'user_takeover'
  }
  return 'identity_unproven'
}

export function projectArchivedOutputLiveness<
  T extends { status: { terminal: string; liveness: string } }
>(output: T, liveness: 'live' | 'unverifiable' | 'exited'): T {
  return {
    ...output,
    status: {
      ...output.status,
      terminal: liveness === 'live' ? 'running' : liveness === 'exited' ? 'exited' : 'unknown',
      liveness
    }
  }
}

export function isStillReleasing(resource: WorkerTerminalResourceRow): boolean {
  return resource.ownership_state === 'owned' && resource.release_state === 'releasing'
}
