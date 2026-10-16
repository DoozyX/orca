import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  agentSessionLeaseFixture,
  agentSessionRecordFixture
} from '../../../shared/agent-session-record.test-fixture'
import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import { formatOrcaSessionAddress } from '../../../shared/orca-session-address'
import { testOrcaSessionId } from '../../../shared/orca-session-address-test-fixture'

const hostRef: { current: unknown } = { current: null }

vi.mock('../../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => hostRef.current
}))

const { OrcaRuntimeWithGetPtyRecordForPaneKey } = await import('./terminal-pane-mail-routing')
const { OrchestrationDb } = await import('./db')
const {
  mintStructuredWorkerHandle,
  mintStructuredWorkerPaneKey,
  structuredWorkerIdentities,
  structuredWorkerProcessIncarnation
} = await import('../structured-worker-identity')

const WORKER = testOrcaSessionId('5d3a9e71-2b4c-4f8a-9e06-1c7b3d5f2a84')
const CHAT = testOrcaSessionId('8e1c4b72-6a3d-4f95-b207-3d9a5c1e7f06')

/** The real idle edge through the real prototype chain, with mail redrive stubbed. */
abstract class IdleEdgeProbe extends OrcaRuntimeWithGetPtyRecordForPaneKey {}

let db: InstanceType<typeof OrchestrationDb>

function probe(): IdleEdgeProbe {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a prototype-only probe; every field the idle edge reads is assigned below.
  return Object.assign(Object.create(IdleEdgeProbe.prototype), {
    getExistingOrchestrationDb: () => db,
    deliverPendingMessagesForHandle: vi.fn(),
    orchestrationStructuredMailboxPointerDelivery: { onJournalActivity: vi.fn() }
  }) as IdleEdgeProbe
}

function installSessions(): void {
  const records = new Map<string, AgentSessionRecord>(
    [WORKER, CHAT].map((sessionId) => [
      sessionId,
      agentSessionRecordFixture(agentSessionLeaseFixture({ sessionId, runtimeKind: 'native' }))
    ])
  )
  hostRef.current = {
    deps: {
      store: {
        getRecord: (sessionId: string) => records.get(sessionId) ?? null,
        listRecords: () => [...records.values()],
        getVisibleSessionTabIndex: () => ({ present: true, sessionIds: [WORKER, CHAT] })
      }
    }
  }
}

function runId(): string {
  return db.createRun({
    objective: 'o',
    coordinatorHandle: 'term_coord',
    coordinatorPaneKey: 'tab_coord:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  }).id
}

/** A supervised Dispatch whose worker is the structured session WORKER. */
function structuredWorkerDispatch(): string {
  const identity = structuredWorkerIdentities.register({
    handle: mintStructuredWorkerHandle(),
    sessionId: WORKER,
    agent: 'claude',
    paneKey: mintStructuredWorkerPaneKey(WORKER),
    processIncarnation: structuredWorkerProcessIncarnation(WORKER),
    worktreeId: 'wt_1',
    hostScope: { kind: 'local', hostId: 'local' }
  })
  const started = db.createStartingWorkerDispatch({
    creator: { kind: 'system' },
    maxDepth: Number.MAX_SAFE_INTEGER,
    taskId: db.createTask({ runId: runId(), spec: 'work' }).id,
    startOptions: {}
  })
  db.prepareStartingWorkerAuthority({
    dispatchId: started.dispatch.id,
    handle: identity.handle,
    paneKey: identity.paneKey,
    processIncarnation: identity.processIncarnation,
    worktreeId: 'wt_1',
    effects: [],
    setupState: 'not_applicable',
    terminalOwnership: 'created'
  })
  db.markWorkerDispatchReady(started.dispatch.id)
  return started.dispatch.id
}

function idle(sessionId: string, statusStartedAt: number | undefined): void {
  probe().onStructuredSessionStatusForMail({
    sessionId,
    status: 'idle',
    ...(statusStartedAt === undefined ? {} : { statusStartedAt })
  })
}

function processTurnFacts(dispatchId: string) {
  return db.getAttemptObservationFacts(dispatchId).filter((fact) => fact.facet === 'process_turn')
}

beforeEach(() => {
  db = new OrchestrationDb(':memory:')
  installSessions()
})

afterEach(() => {
  vi.restoreAllMocks()
  structuredWorkerIdentities.clear()
  db.close()
  hostRef.current = null
})

describe('a structured worker turn that ends without worker_done', () => {
  it('records one finished turn for the worker`s active Dispatch', () => {
    const dispatchId = structuredWorkerDispatch()

    idle(WORKER, 1_000)

    expect(processTurnFacts(dispatchId)).toEqual([
      expect.objectContaining({
        facet: 'process_turn',
        payload: { process: 'running', turn: 'finished' },
        sourceObservedAt: 1_000
      })
    ])
    expect(db.getDispatchContextById(dispatchId)?.status).not.toBe('completed')
  })

  it('records nothing for a repeated idle edge of the same turn, and one fact per later turn', () => {
    const dispatchId = structuredWorkerDispatch()
    const warn = vi.spyOn(console, 'warn')

    idle(WORKER, 1_000)
    idle(WORKER, 1_000)
    expect(processTurnFacts(dispatchId)).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()

    idle(WORKER, 2_000)
    expect(processTurnFacts(dispatchId)).toHaveLength(2)
  })

  it('records nothing once the Dispatch holds an accepted report', () => {
    const dispatchId = structuredWorkerDispatch()
    db.recordAttemptObservation({
      id: 'accepted-report',
      dispatchId,
      sequence: 0,
      authorityId: 'run_home:test',
      authorityClock: 'home',
      facet: 'worker_report',
      payload: { status: 'accepted', outcome: 'succeeded' },
      homeReceivedAt: 500
    })

    idle(WORKER, 1_000)

    expect(processTurnFacts(dispatchId)).toEqual([])
  })

  it('records nothing for an idle edge that names no turn', () => {
    const dispatchId = structuredWorkerDispatch()

    idle(WORKER, undefined)

    expect(processTurnFacts(dispatchId)).toEqual([])
  })

  it('records nothing for a chat that is not a supervised worker', () => {
    const dispatch = db.createDispatchContext({
      taskId: db.createTask({ runId: runId(), spec: 'chat work' }).id,
      assigneeHandle: formatOrcaSessionAddress(CHAT),
      creator: { kind: 'system' },
      maxDepth: Number.MAX_SAFE_INTEGER
    })

    idle(CHAT, 1_000)

    expect(processTurnFacts(dispatch.id)).toEqual([])
  })
})
