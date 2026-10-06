import { projectWorkerFleet } from '../../../rpc/methods/orchestration/worker/worker-list-projection'
import { afterEach, expect, it } from 'vitest'
import { OrchestrationDb } from '../orchestration-db'
import { createRootDispatch } from '../root-dispatch-test-fixture'

let db: OrchestrationDb | undefined
afterEach(() => db?.close())

it('keeps question and approval age independent of heartbeats and liveness observations', () => {
  db = new OrchestrationDb(':memory:')
  const run = db.createRun({
    objective: 'age',
    coordinatorHandle: 'term_coord',
    coordinatorPaneKey: 'tab:11111111-1111-4111-8111-111111111111'
  })
  const task = db.createTask({ runId: run.id, spec: 'wait' })
  const dispatch = createRootDispatch(db, task.id, 'term_worker')
  db.createQuestion({
    runId: run.id,
    dispatchId: dispatch.id,
    askerHandle: 'term_worker',
    question: 'Which?'
  })
  const gateTask = db.createTask({ runId: run.id, spec: 'approval' })
  const gateDispatch = createRootDispatch(db, gateTask.id, 'term_gate')
  db.createGate({ taskId: gateTask.id, question: 'Proceed?' })
  db.db
    .prepare("UPDATE question_threads SET created_at = '2026-10-06 10:00:00' WHERE dispatch_id = ?")
    .run(dispatch.id)
  db.db
    .prepare("UPDATE decision_gates SET created_at = '2026-10-06 10:01:00' WHERE task_id = ?")
    .run(gateTask.id)
  const now = Date.parse('2026-10-06T10:05:00Z')
  db.recordHeartbeat(dispatch.id, '2026-10-06T10:05:00Z')
  db.recordAttemptObservation({
    id: 'alive',
    dispatchId: dispatch.id,
    sequence: 1,
    authorityId: 'home',
    authorityClock: 'home',
    facet: 'liveness',
    payload: { status: 'live', ptyIds: ['pty'] },
    homeReceivedAt: now
  })
  const facts = db.getWorkerAttentionFacts(dispatch.id, now)
  expect(facts.pendingInputAgeMs).toBe(300_000)
  expect(db.getWorkerAttentionFacts(gateDispatch.id, now).pendingApprovalAgeMs).toBe(240_000)
  expect(facts.checkpointAgeMs).toBeNull()
  expect(db.getWorkerAttentionFacts(dispatch.id, now + 60_000).pendingInputAgeMs).toBe(360_000)
  db.recordAttemptObservation({
    id: 'artifact',
    dispatchId: dispatch.id,
    sequence: 2,
    authorityId: 'home',
    authorityClock: 'home',
    facet: 'artifact_git',
    payload: { artifacts: 'present', git: 'changed' },
    homeReceivedAt: now - 120_000
  })
  db.recordAttemptObservation({
    id: 'repaint',
    dispatchId: dispatch.id,
    sequence: 3,
    authorityId: 'home',
    authorityClock: 'home',
    facet: 'process_turn',
    payload: { process: 'running', turn: 'working' },
    homeReceivedAt: now
  })
  expect(db.getWorkerAttentionFacts(dispatch.id, now).checkpointAgeMs).toBe(120_000)
  const fleet = projectWorkerFleet({
    rows: db.listWorkerTerminalResources({ runId: run.id }),
    attentionFacts: db.getWorkerAttentionFactsForDispatches([dispatch.id, gateDispatch.id], now),
    statuses: [],
    now,
    limit: 100
  })
  expect(fleet.workers.find((row) => row.dispatchId === dispatch.id)).toMatchObject({
    stage: { activity: 'waiting' },
    liveness: { verdict: 'unverifiable' },
    diagnostics: { blockerAgeMs: 300_000, checkpointAgeMs: 120_000, stateAgeMs: null }
  })
  expect(fleet.workers.find((row) => row.dispatchId === gateDispatch.id)).toMatchObject({
    stage: { activity: 'waiting' },
    diagnostics: { blockerAgeMs: 240_000 }
  })
})
