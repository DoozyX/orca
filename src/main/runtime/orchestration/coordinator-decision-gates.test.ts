import { afterEach, describe, expect, it } from 'vitest'
import {
  openDecisionGateFromMessage,
  reblockTasksWithPendingGates
} from './coordinator-decision-gates'
import { OrchestrationDb } from './db'
import { createRootDispatch } from './db/root-dispatch-test-fixture'

describe('coordinator decision-gate authority', () => {
  let db: OrchestrationDb

  afterEach(() => {
    db?.close()
  })

  it('opens a gate only for the sender-owned active Dispatch', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ runId: 'run_legacy_local', spec: 'owned gate target' })
    const dispatch = createRootDispatch(db, task.id, 'term_owner', 'tab_owner:leaf_owner')
    const logs: string[] = []

    openDecisionGateFromMessage(
      db,
      db.insertMessage({
        runId: 'run_legacy_local',
        from: 'term_owner',
        to: 'term_coordinator',
        subject: 'Need approval',
        type: 'decision_gate',
        senderPaneKey: 'tab_owner:leaf_owner',
        payload: JSON.stringify({
          taskId: task.id,
          dispatchId: dispatch.id,
          question: 'Proceed?'
        })
      }),
      (message) => logs.push(message)
    )

    expect(db.listGates({ taskId: task.id })).toHaveLength(1)
    expect(db.getTask(task.id)?.status).toBe('blocked')
    expect(db.getDispatchContextById(dispatch.id)?.status).toBe('completed')
    expect(logs.at(-1)).toBe(`Task ${task.id} blocked on decision gate`)
  })

  it('rejects a gate targeting another active Dispatch without mutating either Task', () => {
    db = new OrchestrationDb(':memory:')
    const attackerTask = db.createTask({
      runId: 'run_legacy_local',
      spec: 'attacker assignment'
    })
    const attacker = createRootDispatch(
      db,
      attackerTask.id,
      'term_attacker',
      'tab_attacker:leaf_attacker'
    )
    const victimTask = db.createTask({
      runId: 'run_legacy_local',
      spec: 'victim assignment'
    })
    const victim = createRootDispatch(db, victimTask.id, 'term_victim', 'tab_victim:leaf_victim')
    const logs: string[] = []

    openDecisionGateFromMessage(
      db,
      db.insertMessage({
        runId: 'run_legacy_local',
        from: 'term_attacker',
        to: 'term_coordinator',
        subject: 'Block the victim',
        type: 'decision_gate',
        senderPaneKey: 'tab_attacker:leaf_attacker',
        payload: JSON.stringify({
          taskId: victimTask.id,
          dispatchId: attacker.id,
          question: 'Stop?'
        })
      }),
      (message) => logs.push(message)
    )

    expect(db.listGates({ taskId: victimTask.id })).toHaveLength(0)
    expect(db.getTask(attackerTask.id)?.status).toBe('dispatched')
    expect(db.getTask(victimTask.id)?.status).toBe('dispatched')
    expect(db.getDispatchContextById(attacker.id)?.status).toBe('dispatched')
    expect(db.getDispatchContextById(victim.id)?.status).toBe('dispatched')
    expect(logs.at(-1)).toContain('Rejected decision gate from term_attacker')
  })

  it('accepts the canonical sender of an imported federated Dispatch', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({
      runId: 'run_legacy_local',
      spec: 'remote gate target'
    })
    const dispatch = createRootDispatch(db, task.id, 'remote-worker')

    openDecisionGateFromMessage(
      db,
      db.insertMessage({
        runId: 'run_legacy_local',
        from: `dispatch:${dispatch.id}`,
        to: 'term_coordinator',
        subject: 'Remote approval required',
        type: 'decision_gate',
        payload: JSON.stringify({
          taskId: task.id,
          dispatchId: dispatch.id,
          question: 'Proceed remotely?'
        })
      }),
      () => {}
    )

    expect(db.listGates({ taskId: task.id })).toHaveLength(1)
    expect(db.getTask(task.id)?.status).toBe('blocked')
    expect(db.getDispatchContextById(dispatch.id)?.status).toBe('completed')
  })

  it("records a supervised worker's own gate without blocking its Task", () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ runId: 'run_legacy_local', spec: 'worker-raised gate' })
    const dispatchId = startReadyWorker(db, task.id)
    const logs: string[] = []

    openDecisionGateFromMessage(
      db,
      db.insertMessage({
        runId: 'run_legacy_local',
        from: WORKER_HANDLE,
        to: 'term_coordinator',
        subject: 'Need a call',
        type: 'decision_gate',
        senderPaneKey: WORKER_PANE_KEY,
        payload: JSON.stringify({ taskId: task.id, dispatchId, question: 'Narrow scope?' })
      }),
      (message) => logs.push(message)
    )

    expect(db.listGates({ taskId: task.id })).toMatchObject([
      { status: 'pending', preserved_dispatch_id: dispatchId }
    ])
    expect(db.getTask(task.id)?.status).toBe('dispatched')
    expect(logs.at(-1)).toBe(
      `Decision gate recorded for Task ${task.id}; supervised Dispatch ${dispatchId} keeps running`
    )
  })
})

describe('startup re-block of pending gates', () => {
  let db: OrchestrationDb

  afterEach(() => {
    db?.close()
  })

  it('leaves a Task with a pending recording-only gate unblocked', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ runId: 'run_legacy_local', spec: 'marked gate' })
    startReadyWorker(db, task.id)
    db.createGate({ taskId: task.id, question: 'Proceed?' })

    reblockTasksWithPendingGates(db)

    expect(db.getTask(task.id)?.status).toBe('dispatched')
  })

  it('re-blocks a Task whose pending blocking gate lost its blocked status', () => {
    db = new OrchestrationDb(':memory:')
    const task = db.createTask({ runId: 'run_legacy_local', spec: 'blocking gate' })
    db.createGate({ taskId: task.id, question: 'Proceed?' })
    db.db.prepare("UPDATE tasks SET status = 'ready' WHERE id = ?").run(task.id)

    reblockTasksWithPendingGates(db)

    expect(db.getTask(task.id)?.status).toBe('blocked')
  })
})

const WORKER_HANDLE = 'term_marked'
const WORKER_PANE_KEY = 'tab_marked:aaaaaaaa-aaaa-4aaa-8aaa-000000000001'

function startReadyWorker(db: OrchestrationDb, taskId: string): string {
  const started = db.createStartingWorkerDispatch({
    creator: { kind: 'system' },
    maxDepth: Number.MAX_SAFE_INTEGER,
    taskId,
    startOptions: {}
  })
  db.prepareStartingWorkerAuthority({
    dispatchId: started.dispatch.id,
    handle: WORKER_HANDLE,
    paneKey: WORKER_PANE_KEY,
    processIncarnation: 'marked:1',
    worktreeId: 'repo::marked',
    effects: [],
    setupState: 'not_applicable',
    terminalOwnership: 'created'
  })
  db.markWorkerDispatchReady(started.dispatch.id)
  return started.dispatch.id
}
