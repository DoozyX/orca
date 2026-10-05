import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  OrcaRuntimeService,
  OrchestrationDb,
  createRootDispatch,
  makePaneKey
} from '../orca-runtime-test-mocks.spec'
import { TEST_WORKTREE_ID, store } from '../orca-runtime-test-fixtures.spec'

const COORDINATOR = {
  tabId: 'tab-run-coordinator',
  leafId: '30000000-0000-4000-8000-000000000001',
  ptyId: 'pty-run-coordinator',
  paneRuntimeId: 1
}
const WORKER = {
  tabId: 'tab-run-worker',
  leafId: '30000000-0000-4000-8000-000000000002',
  ptyId: 'pty-run-worker',
  paneRuntimeId: 2
}
const WORKER_PANE_KEY = makePaneKey(WORKER.tabId, WORKER.leafId)

function graphOf(terminals: (typeof COORDINATOR)[]) {
  return {
    tabs: terminals.map((terminal) => ({
      tabId: terminal.tabId,
      worktreeId: TEST_WORKTREE_ID,
      title: terminal.tabId,
      activeLeafId: terminal.leafId,
      layout: null
    })),
    leaves: terminals.map((terminal) => ({
      tabId: terminal.tabId,
      worktreeId: TEST_WORKTREE_ID,
      leafId: terminal.leafId,
      paneRuntimeId: terminal.paneRuntimeId,
      ptyId: terminal.ptyId,
      paneTitle: null
    }))
  }
}

/** A worker whose dispatch settled long enough ago to leave the sidebar's display window. */
function settleWorkerPastDisplayWindow() {
  const runtime = new OrcaRuntimeService(store)
  const coordinatorHandle = runtime.preAllocateHandleForPty(COORDINATOR.ptyId)
  const workerHandle = runtime.preAllocateHandleForPty(WORKER.ptyId)
  const db = new OrchestrationDb(':memory:')
  const run = db.createRun({
    objective: 'run membership oracle',
    coordinatorHandle,
    coordinatorPaneKey: makePaneKey(COORDINATOR.tabId, COORDINATOR.leafId)
  })
  const task = db.createTask({ spec: 'settled worker', runId: run.id })
  const dispatch = createRootDispatch(db, task.id, workerHandle, WORKER_PANE_KEY)
  runtime.setOrchestrationDb(db)
  runtime.attachWindow(1)
  runtime.syncWindowGraph(1, graphOf([COORDINATOR, WORKER]))
  db.completeDispatch(dispatch.id)
  vi.useFakeTimers()
  vi.setSystemTime(Date.now() + AGENT_STATUS_STALE_AFTER_MS + 5_000)
  return { runtime, db, coordinatorHandle }
}

describe('OrcaRuntimeService run worker panes', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes a settled worker as a run member while its coordinator is live', () => {
    const { runtime, db } = settleWorkerPastDisplayWindow()
    try {
      const result = runtime.syncWindowGraph(1, graphOf([COORDINATOR, WORKER]))

      expect(result.agentOrchestrationByPaneKey?.[WORKER_PANE_KEY]).toBeUndefined()
      expect(result.agentRunWorkerPaneKeys).toEqual([WORKER_PANE_KEY])
    } finally {
      db.close()
    }
  })

  it('drops the worker once the coordinator pane is closed', () => {
    const { runtime, db } = settleWorkerPastDisplayWindow()
    try {
      runtime.onPtyExit(COORDINATOR.ptyId, 0)
      const result = runtime.syncWindowGraph(1, graphOf([WORKER]))

      expect(result.agentRunWorkerPaneKeys).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('drops the worker once its coordinator moves on to another run', () => {
    const { runtime, db, coordinatorHandle } = settleWorkerPastDisplayWindow()
    try {
      db.createRun({
        objective: 'the next run',
        coordinatorHandle,
        coordinatorPaneKey: makePaneKey(COORDINATOR.tabId, COORDINATOR.leafId)
      })

      const result = runtime.syncWindowGraph(1, graphOf([COORDINATOR, WORKER]))

      expect(result.agentRunWorkerPaneKeys).toBeUndefined()
    } finally {
      db.close()
    }
  })
})
