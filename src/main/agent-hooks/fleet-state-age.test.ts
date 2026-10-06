import { afterEach, expect, it, vi } from 'vitest'
import { AgentHookServer } from './server'
import { PANE } from './server.test-fixtures'
import { mintFleetAgentStatusEvidence } from '../../shared/orchestration-fleet-agent-status-evidence'
import { projectOrchestrationFleet } from '../../shared/orchestration-fleet-projection'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: vi.fn() }))

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

it.each([
  ['relay behind', 38_000],
  ['relay ahead', 158_000],
  ['old host without main-agent clock', undefined]
])('keeps state age unknown after real remote ingestion: %s', (_, stateStartedAt) => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  const server = new AgentHookServer()
  server.ingestRemote(
    {
      paneKey: PANE,
      tabId: 'tab-1',
      worktreeId: 'folder',
      evidenceAgeMs: 0,
      payload: {
        state: 'working',
        prompt: 'test',
        agentType: 'claude',
        ...(stateStartedAt === undefined ? {} : { mainAgent: { state: 'blocked', stateStartedAt } })
      }
    },
    'ssh'
  )
  const status = server.getStatusSnapshot()[0]
  expect(status).toBeDefined()
  expect(status.mainAgent?.stateStartedAt).toBe(stateStartedAt)
  const evidence = mintFleetAgentStatusEvidence(status, {
    kind: 'pane',
    paneKey: PANE,
    terminalHandle: 'term',
    processIncarnation: 'p'
  })
  const row = projectOrchestrationFleet({
    workers: [
      {
        dispatchId: 'd',
        taskId: 't',
        runId: 'r',
        parentTaskId: null,
        workerState: 'ready',
        dispatchStatus: 'dispatched',
        workerStage: 'prompt_delivered',
        agentTerminalHandle: 'term',
        paneKey: PANE,
        worktreeId: 'folder',
        terminalState: 'active',
        resource: null
      }
    ],
    statuses: [evidence],
    now: 100_000
  }).workers[0]
  expect(row.liveness.verdict).toBe('live')
  expect(row.host.kind).toBe('remote')
  expect(row.diagnostics?.stateAgeMs).toBeNull()
})
