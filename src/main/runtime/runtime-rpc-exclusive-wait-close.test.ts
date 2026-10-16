import './rpc/unused-default-rpc-methods.test-fixture'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'
import { OrchestrationDb } from './orchestration/db'
import { readRuntimeMetadata } from './runtime-metadata'
import { createLongPollServer } from './runtime-rpc-long-poll-server.test-fixture'
import { openFramedSession, sleep, waitFor, type FramedSession } from './runtime-rpc-test-harness'
import { COORDINATOR_PANE_KEY } from './rpc/methods/orchestration/rpc-test-harness'

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  listWorktreesStrict: vi.fn().mockResolvedValue([])
}))

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    await cleanup()
  }
  vi.restoreAllMocks()
})

async function startRunBoundServer() {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-rpc-'))
  const runtime = new OrcaRuntimeService()
  const db = new OrchestrationDb(':memory:')
  runtime.setOrchestrationDb(db)
  cleanups.push(() => db.close())
  vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation((handle) =>
    handle === 'term_coord' ? COORDINATOR_PANE_KEY : null
  )
  vi.spyOn(runtime, 'getLiveTerminalPaneKey').mockImplementation((handle) =>
    runtime.getTerminalPaneKey(handle)
  )
  vi.spyOn(runtime, 'getTerminalProcessIncarnation').mockImplementation((handle) =>
    handle.startsWith('term_') ? `runtime_test:${handle}:1` : null
  )
  const run = db.createRun({
    objective: 'Exclusive wait',
    coordinatorHandle: 'term_coord',
    coordinatorPaneKey: COORDINATOR_PANE_KEY
  })
  const server = createLongPollServer({ runtime, userDataPath, keepaliveIntervalMs: 1000 })
  await server.start()
  cleanups.push(() => server.stop())
  const metadata = readRuntimeMetadata(userDataPath)
  const endpoint = metadata!.transports[0]!.endpoint
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: OrcaRuntimeService exposes messageWaitersByHandle from runtime-client-state.ts.
  const internals = runtime as unknown as { messageWaitersByHandle: Map<string, Set<unknown>> }
  const runWaiterCount = (): number =>
    internals.messageWaitersByHandle.get(`run:${run.id}`)?.size ?? 0
  const openWait = (id: string): FramedSession => {
    const session = openFramedSession(endpoint, {
      id,
      authToken: metadata!.authToken,
      method: 'orchestration.check',
      params: {
        terminal: 'term_coord',
        terminalPaneKey: COORDINATOR_PANE_KEY,
        run: run.id,
        wait: true,
        timeoutMs: 10_000
      }
    })
    cleanups.push(async () => {
      session.socket.destroy()
      await session.done
    })
    return session
  }
  return { runtime, db, run, runWaiterCount, openWait }
}

function terminalFrame(session: FramedSession): Record<string, unknown> | undefined {
  return session.frames.find((frame) => frame.ok !== undefined)
}

describe('exclusive Run check --wait across client sockets', () => {
  it('keeps exclusivity while both clients live, and frees it once the waiter socket closes', async () => {
    const { runtime, db, run, runWaiterCount, openWait } = await startRunBoundServer()

    const a = openWait('req_a')
    await waitFor(() => runWaiterCount() === 1)
    const b = openWait('req_b')
    await b.done
    expect(terminalFrame(b)).toMatchObject({
      id: 'req_b',
      ok: false,
      error: { code: 'waiter_exists' }
    })
    expect(terminalFrame(a)).toBeUndefined()
    expect(runWaiterCount()).toBe(1)

    a.socket.destroy()
    await a.done
    await waitFor(() => runWaiterCount() === 0)

    const c = openWait('req_c')
    await waitFor(() => runWaiterCount() === 1)
    await sleep(50)
    expect(terminalFrame(c)).toBeUndefined()
    const done = db.insertMessage({
      from: 'term_worker',
      to: `run:${run.id}`,
      runId: run.id,
      subject: 'finished after the orphan exited',
      type: 'worker_done'
    })
    runtime.notifyMessageArrived(`run:${run.id}`, 'worker_done')
    await c.done

    expect(terminalFrame(c)).toMatchObject({
      id: 'req_c',
      ok: true,
      result: { runId: run.id, messages: [{ id: done.id }], count: 1 }
    })
  })
})
