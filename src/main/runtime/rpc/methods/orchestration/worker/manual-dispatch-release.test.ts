import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from '../../../../../sqlite/sync-database'
import { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationDb } from '../../../../orchestration/db'
import type { OrchestrationSessionCaller } from '../../../../orchestration/orchestration-caller-identity'
import { ORCHESTRATION_METHODS } from '../../orchestration'
import { eraseRpcMethods, type RpcContext } from '../../../core'
import { parseOrcaSessionAddress } from '../../../../../../shared/orca-session-address'
import {
  agentSessionLeaseFixture,
  agentSessionRecordFixture
} from '../../../../../../shared/agent-session-record.test-fixture'
import { computeAgentSessionPayloadFingerprint } from '../../../../../../shared/agent-session-mutation-envelope'
import {
  mintStructuredWorkerHandle,
  mintStructuredWorkerPaneKey,
  structuredWorkerIdentities,
  structuredWorkerProcessIncarnation
} from '../../../../structured-worker-identity'

const hostRef = vi.hoisted((): { current: unknown } => ({ current: null }))
vi.mock(
  '../../../../../native-chat/agent-session-wire/structured-agent-session-registry',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getStructuredAgentSessionHost: () => hostRef.current
  })
)

const COORDINATOR = 'term_coordinator'
const TARGET = 'term_target'
const OTHER = 'term_other'
const SUPERVISED = 'term_supervised'
const SESSION = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

describe('manual Dispatch release', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let runId: string
  // The structured worker's running turn, as the fake host's current work reads it.
  let activeTurn: string | null
  let owesSend: boolean

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
    vi.spyOn(runtime, 'getTerminalPaneKey').mockImplementation((handle) => paneKey(handle))
    vi.spyOn(runtime, 'getTerminalProcessIncarnation').mockImplementation(
      (handle) => `${handle}:process`
    )
    vi.spyOn(runtime, 'closeTerminal').mockResolvedValue({ closed: true } as never)
    vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
    structuredWorkerIdentities.clear()
    hostRef.current = null
    activeTurn = 'turn-1'
    owesSend = false
    runId = db.createRun({
      objective: 'Release manual Dispatches',
      coordinatorHandle: COORDINATOR,
      coordinatorPaneKey: paneKey(COORDINATOR)
    }).id
  })

  afterEach(() => db.close())

  it.each([
    ['orchestration.workerAbandon', 'abandoned'],
    ['orchestration.workerStop', 'stopped']
  ] as const)('releases a context-only Dispatch through %s', async (method, expectedState) => {
    const unrelated = await dispatchNewTask(OTHER, 'unrelated')
    const supervised = createSupervisedWorker()
    const targetTask = createTask('target')
    const targetDispatch = await dispatchTask(targetTask, TARGET)
    const question = db.createQuestion({
      runId,
      dispatchId: targetDispatch,
      askerHandle: TARGET,
      question: 'Can this assignment finish?'
    })
    expect(db.getWorkerDispatch(targetDispatch)).toBeUndefined()
    await expect(call('orchestration.dispatchShow', { task: targetTask })).resolves.toMatchObject({
      dispatch: { id: targetDispatch, status: 'dispatched' }
    })

    const notify = vi.spyOn(runtime, 'notifyMessageArrived')
    notify.mockClear()
    const released = (await call(method, { dispatch: targetDispatch })) as {
      state: string
      alreadySettled: boolean
      processAction: string
      residualResources?: unknown[]
    }
    expect(released).toMatchObject({
      state: expectedState,
      alreadySettled: false,
      processAction: 'none'
    })
    if (method === 'orchestration.workerAbandon') {
      expect(released.residualResources).toEqual([])
    }
    expect(released).not.toHaveProperty('interrupt')

    expect(db.getDispatchContextById(targetDispatch)).toMatchObject({
      status: 'failed',
      last_failure: expectedState,
      capability_revoked_at: expect.any(String),
      completed_at: expect.any(String)
    })
    expect(db.getTask(targetTask)?.status).toBe('blocked')
    expect(db.getQuestion(question.message.id)?.status).toBe('closed')
    expect(db.getActiveDispatchForIdentity(TARGET, paneKey(TARGET))).toBeUndefined()
    expect(runtime.closeTerminal).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(`dispatch:${targetDispatch}`, 'status')

    expect(db.getDispatchContextById(unrelated)).toMatchObject({ status: 'dispatched' })
    expect(db.getWorkerDispatch(supervised)).toMatchObject({ state: 'ready' })
    expect(db.getDispatchContextById(supervised)).toMatchObject({ status: 'dispatched' })

    const oppositeMethod =
      method === 'orchestration.workerAbandon'
        ? 'orchestration.workerStop'
        : 'orchestration.workerAbandon'
    await expect(call(oppositeMethod, { dispatch: targetDispatch })).resolves.toMatchObject({
      state: expectedState,
      alreadySettled: true,
      processAction: 'none'
    })
    expect(notify).toHaveBeenCalledTimes(1)

    const replacement = await dispatchNewTask(TARGET, 'replacement')
    expect(replacement).not.toBe(targetDispatch)
    expect(db.getActiveDispatchForIdentity(TARGET, paneKey(TARGET))?.id).toBe(replacement)
  })

  it('fences a superseded context without blocking its current replacement', async () => {
    const task = createTask('superseded')
    const superseded = await dispatchTask(task, TARGET)
    // Why: recovery still needs coverage for contradictory rows persisted before ready resets were guarded.
    sqliteFor(db).prepare("UPDATE tasks SET status = 'ready' WHERE id = ?").run(task)
    const current = await dispatchTask(task, OTHER)

    await expect(call('orchestration.workerStop', { dispatch: superseded })).resolves.toMatchObject(
      {
        state: 'stopped',
        alreadySettled: false,
        processAction: 'none'
      }
    )

    expect(db.getDispatchContextById(superseded)).toMatchObject({
      status: 'failed',
      last_failure: 'stopped'
    })
    expect(db.getDispatchContextById(current)).toMatchObject({ status: 'dispatched' })
    expect(db.getTask(task)?.status).toBe('dispatched')
    expect(db.getActiveDispatchForIdentity(TARGET, paneKey(TARGET))).toBeUndefined()
    expect(db.getActiveDispatchForIdentity(OTHER, paneKey(OTHER))?.id).toBe(current)
    expect(runtime.closeTerminal).not.toHaveBeenCalled()

    await expect(dispatchNewTask(TARGET, 'reuses superseded terminal')).resolves.toMatch(/^ctx_/)
  })

  it('refuses a stop scoped to another Run without changing anything', async () => {
    const task = createTask('run scoped stop')
    const dispatchId = await dispatchTask(task, TARGET)
    const before = db.getDispatchContextById(dispatchId)

    await expect(
      call('orchestration.workerStop', { dispatch: dispatchId, run: 'run_other' })
    ).rejects.toMatchObject({
      code: 'dispatch_run_mismatch',
      message: `Dispatch ${dispatchId} belongs to Run ${runId}, not run_other.`
    })
    expect(db.getDispatchContextById(dispatchId)).toEqual(before)
    expect(db.getTask(task)?.status).toBe('dispatched')

    await expect(
      call('orchestration.workerStop', { dispatch: dispatchId, run: runId })
    ).resolves.toMatchObject({ state: 'stopped', alreadySettled: false })
  })

  it.each([
    ['cancelled it', true, null, { outcome: 'cancelled' }],
    ['found it ended', false, null, { outcome: 'no_running_turn' }],
    [
      'could not confirm it stopped',
      false,
      'turn-1',
      { outcome: 'not_interrupted', reason: expect.stringContaining('did not confirm') }
    ]
  ] as const)(
    'reports the turn a stopped context-only Dispatch was running when the host %s',
    async (_case, cancelled, turnAfterCancel, interrupt) => {
      const cancel = vi.fn(async () => {
        activeTurn = turnAfterCancel
        return { ok: true, replayed: false, fence: 3, value: { cancelled } }
      })
      installStructuredHost('local', cancel)
      const dispatchId = await dispatchTask(createTask('structured stop'), structuredWorker())

      const stopped = await call('orchestration.workerStop', { dispatch: dispatchId })
      expect(stopped).toMatchObject({ state: 'stopped', processAction: 'none', interrupt })
      expect(stopped).toHaveProperty(
        'warning',
        turnAfterCancel === null
          ? expect.not.stringContaining('may still be running')
          : expect.stringContaining('may still be running')
      )
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(
        { callerKey: `trusted-local:orchestration:${dispatchId}` },
        {
          turnId: 'turn-1',
          envelope: expect.objectContaining({
            sessionId: SESSION,
            expectedRuntimeFence: 3,
            payloadFingerprint: computeAgentSessionPayloadFingerprint({
              method: 'agentSession.cancel',
              sessionId: SESSION,
              fields: { turnId: 'turn-1' }
            })
          })
        }
      )
      await expect(
        call('orchestration.workerStop', { dispatch: dispatchId })
      ).resolves.not.toHaveProperty('interrupt')
      expect(cancel).toHaveBeenCalledTimes(1)
    }
  )

  it('never cancels the turn of a Dispatch that takes the worker over during the stop', async () => {
    const worker = structuredWorker()
    let replacement = ''
    // At the stop's first await, a new Dispatch acquires the worker and its turn opens.
    const replace = async () => {
      if (!replacement) {
        replacement = await dispatchTask(createTask('replacement'), worker)
        activeTurn = 'turn-2'
      }
    }
    vi.mocked(runtime.ensureStructuredAgentSessionHost).mockImplementation(replace)
    const cancel = vi.fn(async (_caller: unknown, params: { turnId?: string }) => {
      await replace()
      // As the host: an unnamed Stop ends whatever runs; a named one only that turn.
      const stops = params.turnId === undefined ? activeTurn !== null : params.turnId === activeTurn
      return { ok: true, replayed: false, fence: 3, value: { cancelled: stops } }
    })
    installStructuredHost('local', cancel)
    const stopped = await dispatchTask(createTask('stopped'), worker)

    await expect(call('orchestration.workerStop', { dispatch: stopped })).resolves.toMatchObject({
      state: 'stopped',
      interrupt: { outcome: 'no_running_turn' }
    })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel.mock.calls[0]?.[1]).toMatchObject({ turnId: 'turn-1' })
    expect(db.getDispatchContextById(replacement)?.status).toBe('dispatched')
  })

  it.each([
    ['nothing runs', false, { outcome: 'no_running_turn' }],
    [
      'its next turn has not opened',
      true,
      { outcome: 'not_interrupted', reason: expect.stringContaining('has not opened') }
    ]
  ] as const)(
    'cancels nothing for a stopped structured worker when %s',
    async (_case, owes, interrupt) => {
      const cancel = vi.fn()
      installStructuredHost('local', cancel)
      const dispatchId = await dispatchTask(createTask('structured idle'), structuredWorker())
      activeTurn = null
      owesSend = owes

      await expect(
        call('orchestration.workerStop', { dispatch: dispatchId })
      ).resolves.toMatchObject({ state: 'stopped', processAction: 'none', interrupt })
      expect(cancel).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['runs on another host', 'ssh-1', 'another host'],
    ['has no readable session record', null, 'No durable record'],
    ['refuses the cancel', 'local', 'The session fence moved.']
  ])(
    'says a structured worker may still be running when its session %s',
    async (_case, executionHostId, reason) => {
      const refuse = vi.fn(async () => ({
        ok: false,
        refusal: { code: 'stale_fence', message: 'The session fence moved.' }
      }))
      installStructuredHost('local', refuse)
      const dispatchId = await dispatchTask(createTask('structured elsewhere'), structuredWorker())
      installStructuredHost(executionHostId, refuse)

      await expect(
        call('orchestration.workerStop', { dispatch: dispatchId })
      ).resolves.toMatchObject({
        state: 'stopped',
        processAction: 'none',
        interrupt: { outcome: 'not_interrupted', reason: expect.stringContaining(reason) },
        warning: expect.stringContaining('may still be running')
      })
      expect(refuse).toHaveBeenCalledTimes(executionHostId === 'local' ? 1 : 0)
      expect(db.getDispatchContextById(dispatchId)).toMatchObject({
        status: 'failed',
        last_failure: 'stopped'
      })
    }
  )

  it('keeps unknown Dispatch errors honest', async () => {
    await expect(
      call('orchestration.workerAbandon', { dispatch: 'ctx_missing' })
    ).rejects.toMatchObject({ code: 'dispatch_not_found' })
    await expect(
      call('orchestration.workerStop', { dispatch: 'ctx_missing' })
    ).rejects.toMatchObject({ code: 'dispatch_not_found' })
  })

  function createTask(spec: string): string {
    return db.createTask({ spec, runId }).id
  }

  async function dispatchNewTask(handle: string, spec: string): Promise<string> {
    return dispatchTask(createTask(spec), handle)
  }

  async function dispatchTask(taskId: string, handle: string): Promise<string> {
    const result = (await call('orchestration.dispatch', {
      task: taskId,
      run: runId,
      from: COORDINATOR,
      to: handle
    })) as { dispatch: { id: string } }
    return result.dispatch.id
  }

  function structuredWorker(): string {
    const handle = mintStructuredWorkerHandle()
    structuredWorkerIdentities.register({
      handle,
      sessionId: SESSION,
      agent: 'codex',
      paneKey: mintStructuredWorkerPaneKey(SESSION),
      processIncarnation: structuredWorkerProcessIncarnation(SESSION),
      worktreeId: 'repo::worktree',
      hostScope: { kind: 'local', hostId: 'local' }
    })
    return handle
  }

  /** `executionHostId` null: the host holds no durable record for the session. */
  function installStructuredHost(executionHostId: string | null, cancel: unknown): void {
    const record = agentSessionRecordFixture(
      agentSessionLeaseFixture({ sessionId: SESSION, runtimeFence: 3 })
    )
    const located = executionHostId
      ? { ...record, location: { ...record.location, executionHostId } }
      : null
    hostRef.current = {
      deps: {
        store: {
          getRecord: (id: string) => (id === SESSION ? located : null),
          listRecords: () => (located ? [located] : [])
        }
      },
      hasSession: () => true,
      getPersistedVisibleSessionTabIndex: () => ({ present: true, sessionIds: [SESSION] }),
      currentWork: (id: string) =>
        id === SESSION
          ? { activeTurnId: () => activeTurn, working: () => activeTurn !== null || owesSend }
          : null,
      cancel
    }
  }

  function createSupervisedWorker(): string {
    const started = db.createStartingWorkerDispatch({
      creator: { kind: 'system' },
      maxDepth: Number.MAX_SAFE_INTEGER,
      taskId: createTask('supervised'),
      startOptions: {}
    })
    db.prepareStartingWorkerAuthority({
      dispatchId: started.dispatch.id,
      handle: SUPERVISED,
      paneKey: paneKey(SUPERVISED),
      processIncarnation: `${SUPERVISED}:process`,
      worktreeId: 'repo::worktree',
      setupState: 'not_applicable',
      effects: []
    })
    db.markWorkerDispatchReady(started.dispatch.id)
    return started.dispatch.id
  }

  async function call(name: string, params: Record<string, unknown>): Promise<unknown> {
    const method = eraseRpcMethods(ORCHESTRATION_METHODS).find(
      (candidate) => candidate.name === name
    )
    if (!method) {
      throw new Error(`Method not found: ${name}`)
    }
    return method.handler(method.params!.parse(params), { runtime })
  }
})

function paneKey(handle: string): string {
  return `tab:${handle}`
}

function sqliteFor(db: OrchestrationDb): Database.Database {
  return (db as unknown as { db: Database.Database }).db
}

describe('orchestration.workerAbandon', () => {
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService

  beforeEach(() => {
    db = new OrchestrationDb(':memory:')
    runtime = new OrcaRuntimeService()
    runtime.setOrchestrationDb(db)
  })
  afterEach(() => db.close())

  function readyWorker(): string {
    const task = db.createTask({ runId: 'run_legacy_local', spec: 'abandon caller' })
    const { dispatch } = db.createStartingWorkerDispatch({
      taskId: task.id,
      startOptions: {},
      creator: { kind: 'system' },
      maxDepth: 9
    })
    db.prepareStartingWorkerAuthority({
      dispatchId: dispatch.id,
      handle: 'term_worker',
      paneKey: 'tab_worker:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      processIncarnation: 'inc_worker',
      worktreeId: 'wt',
      effects: [],
      setupState: 'not_configured'
    })
    db.markWorkerDispatchReady(dispatch.id)
    return dispatch.id
  }

  async function abandon(dispatchId: string, ctx: Partial<RpcContext>) {
    const method = eraseRpcMethods(ORCHESTRATION_METHODS).find(
      (m) => m.name === 'orchestration.workerAbandon'
    )!
    return method.handler(method.params!.parse({ dispatch: dispatchId }), { runtime, ...ctx })
  }

  it('never records an unverified terminal handle as the one who abandoned the worker', async () => {
    const dispatchId = readyWorker()

    await expect(
      abandon(dispatchId, { orchestrationCompatibilityEvidence: { terminalHandle: 'term_coord' } })
    ).resolves.toMatchObject({ state: 'abandoned', alreadySettled: false })
    expect(db.getWorkerDispatch(dispatchId)?.last_error).toBe(
      'Abandoned by an unidentified caller.'
    )
  })

  it('records the resolved Orca session as the one who abandoned the worker', async () => {
    const dispatchId = readyWorker()
    const orcaSessionId = parseOrcaSessionAddress('orca_session_id:chat_1')!
    const session: OrchestrationSessionCaller = {
      address: 'orca_session_id:chat_1',
      terminalHandle: null,
      paneKey: null,
      orcaSessionId,
      sessionId: orcaSessionId,
      workspaceId: 'wt'
    }

    await abandon(dispatchId, {
      orchestrationCaller: session,
      orchestrationCompatibilityEvidence: { terminalHandle: 'term_coord' }
    })
    expect(db.getWorkerDispatch(dispatchId)?.last_error).toBe(
      'Abandoned by orca_session_id:chat_1.'
    )
  })

  it('reports an already-settled worker as stale and changes nothing', async () => {
    const dispatchId = readyWorker()
    db.failDispatch(dispatchId, 'tab closed', { workerProcessExited: true })
    const before = db.getWorkerDispatch(dispatchId)

    await expect(abandon(dispatchId, {})).resolves.toMatchObject({
      state: 'failed',
      alreadySettled: true,
      stale: true
    })
    expect(db.getWorkerDispatch(dispatchId)).toEqual(before)
  })
})
