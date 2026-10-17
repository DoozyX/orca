import { describe, expect, it } from 'vitest'
import { isWorkerTerminalReclaimable } from './worker-terminal-reclaimable'

describe('isWorkerTerminalReclaimable', () => {
  it.each(['succeeded', 'failed'])(
    'reclaims an owned terminal with no release decision under a %s worker',
    (workerState) => {
      expect(
        isWorkerTerminalReclaimable({
          workerState,
          ownershipState: 'owned',
          releaseState: 'not_requested'
        })
      ).toBe(true)
    }
  )

  // A stopped or abandoned worker's release is always refused `identity_unproven`.
  it.each(['stopped', 'abandoned', 'ready', 'unsupervised'])(
    'never reclaims the terminal of a %s worker',
    (workerState) => {
      expect(
        isWorkerTerminalReclaimable({
          workerState,
          ownershipState: 'owned',
          releaseState: 'not_requested'
        })
      ).toBe(false)
    }
  )

  it.each(['retained', 'unknown', 'requested', 'releasing', 'released'])(
    'never reclaims a terminal whose release state is %s',
    (releaseState) => {
      expect(
        isWorkerTerminalReclaimable({
          workerState: 'succeeded',
          ownershipState: 'owned',
          releaseState
        })
      ).toBe(false)
    }
  )

  it.each(['transferred', 'user_owned', 'external', 'released'])(
    'never reclaims a %s terminal',
    (ownershipState) => {
      expect(
        isWorkerTerminalReclaimable({
          workerState: 'succeeded',
          ownershipState,
          releaseState: 'not_requested'
        })
      ).toBe(false)
    }
  )
})
