import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HeadlessEmulator } from '../../../daemon/emulation/headless-emulator'
import { observeCodexCapacityTerminalStatus } from './codex-notice-terminal-status'
import { mintFleetAgentStatusEvidence } from '../../../../shared/orchestration/fleet/orchestration-fleet-agent-status-evidence'
import { projectOrchestrationFleetWorker } from '../../../../shared/orchestration/fleet/orchestration-fleet-worker-projection'

const transcript = readFileSync(
  new URL('../../__fixtures__/codex-model-capacity.txt', import.meta.url),
  'utf8'
)
void readFileSync(
  new URL('../../__fixtures__/codex-model-capacity-fullscreen.txt', import.meta.url),
  'utf8'
)

describe('Codex model capacity terminal status', () => {
  it('turns the fleet activity of a working Codex worker to done', async () => {
    const emulator = new HeadlessEmulator({ cols: 80, rows: 24 })
    const now = 1_800_000_000_000
    try {
      await emulator.write(transcript)
      const detected = observeCodexCapacityTerminalStatus(
        emulator,
        transcript,
        undefined,
        'codex',
        () => ({ agentType: 'codex', prompt: 'Ship it', model: 'gpt-5' })
      )
      expect(detected).not.toBeNull()
      const paneKey = 'tab-capacity:leaf-capacity'
      const evidence = mintFleetAgentStatusEvidence(
        {
          ...detected!,
          paneKey,
          connectionId: null,
          receivedAt: now,
          evidenceObservedAt: now,
          agentEvidenceObservedAt: now,
          stateStartedAt: now,
          observation: {
            origin: 'osc',
            authorityId: 'main:capacity',
            incarnation: 0,
            revision: 3,
            observedAt: now,
            kind: 'snapshot'
          }
        },
        {
          kind: 'worker',
          dispatchId: 'ctx_capacity',
          terminalHandle: 'term_capacity',
          paneKey,
          processIncarnation: 'pty-capacity:1'
        }
      )

      const projected = projectOrchestrationFleetWorker(
        {
          dispatchId: 'ctx_capacity',
          taskId: 'task_capacity',
          runId: 'run_capacity',
          parentTaskId: null,
          workerState: 'ready',
          dispatchStatus: 'dispatched',
          workerStage: 'prompt_delivered',
          agentTerminalHandle: 'term_capacity',
          paneKey,
          worktreeId: 'wt-capacity',
          terminalState: 'active',
          resource: null
        },
        evidence,
        now
      )

      expect(projected.liveness.verdict).toBe('live')
      expect(projected.stage.activity).toBe('done')
    } finally {
      emulator.dispose()
    }
  })

  it.each([100, 101])(
    'does not close a hook turn starting at or after output time (%i)',
    async (turnStartedAt) => {
      const emulator = new HeadlessEmulator({ cols: 80, rows: 24 })
      try {
        await emulator.write(transcript)
        expect(
          observeCodexCapacityTerminalStatus(
            emulator,
            transcript,
            undefined,
            'codex',
            () => ({
              agentType: 'codex',
              prompt: 'Retry',
              turnStartedAt
            }),
            100
          )
        ).toBeNull()
      } finally {
        emulator.dispose()
      }
    }
  )
})
