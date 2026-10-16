import '../../../unused-default-rpc-methods.test-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../../../../../shared/protocol-version'
import { ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS } from '../../../../../../shared/orchestration-timing-budgets'
import type { OrchestrationDb } from '../../../../orchestration/db'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { RpcContext, RpcRequest } from '../../../core'
import { RpcDispatcher } from '../../../dispatcher'
import { ORCHESTRATION_METHODS } from '../../orchestration'
import { createOrchestrationRpcHarness } from '../rpc-test-harness'

const WORKER = 'structworker_delivery'
const WORKER_PANE = 'tab_worker:aaaaaaaa-aaaa-4aaa-8aaa-000000000003'
const WORKER_INCARNATION = 'worker:1'

describe('send receipt delivery for a structured worker', () => {
  const harness = createOrchestrationRpcHarness()
  let db: OrchestrationDb
  let runtime: OrcaRuntimeService
  let ctx: RpcContext
  let dispatchId: string

  function setup(): void {
    ;({ db, runtime, ctx } = harness.setup())
    const task = db.createTask({ spec: 'long running work' })
    const started = db.createStartingWorkerDispatch({
      creator: { kind: 'system' },
      maxDepth: Number.MAX_SAFE_INTEGER,
      taskId: task.id,
      startOptions: {}
    })
    dispatchId = started.dispatch.id
    db.prepareStartingWorkerAuthority({
      dispatchId,
      handle: WORKER,
      paneKey: WORKER_PANE,
      processIncarnation: WORKER_INCARNATION,
      worktreeId: 'repo::worker',
      effects: [],
      setupState: 'not_applicable',
      terminalOwnership: 'created'
    })
    db.markWorkerDispatchReady(dispatchId)
    const paneKeys = (handle: string): string | null =>
      handle === 'term_coord'
        ? harness.coordinatorPaneKey
        : handle === WORKER
          ? WORKER_PANE
          : handle === 'term_agent'
            ? 'tab_agent:aaaaaaaa-aaaa-4aaa-8aaa-000000000004'
            : null
    vi.mocked(runtime.getTerminalPaneKey).mockImplementation(paneKeys)
    vi.mocked(runtime.getLiveTerminalPaneKey).mockImplementation(paneKeys)
    vi.mocked(runtime.getTerminalProcessIncarnation).mockImplementation((handle) =>
      handle === WORKER ? WORKER_INCARNATION : `runtime_test:${handle}:1`
    )
  }

  afterEach(() => {
    harness.cleanup()
    vi.restoreAllMocks()
  })

  function send(params: Record<string, unknown>): Promise<unknown> {
    return harness.call(
      'orchestration.send',
      { from: 'term_coord', subject: 'addendum', ...params },
      ctx
    )
  }

  it.each(['queued', 'injected'] as const)(
    'reports the lane answer %s for a send to the worker',
    async (delivery) => {
      setup()
      const observe = vi
        .spyOn(runtime.structuredSendDeliveryWatch, 'observe')
        .mockResolvedValue(delivery)

      const receipt = await send({ to: WORKER })

      expect(receipt).toMatchObject({ message: { to_handle: `dispatch:${dispatchId}` }, delivery })
      expect(observe).toHaveBeenCalledWith(
        `dispatch:${dispatchId}`,
        expect.stringMatching(/^msg_/),
        ORCHESTRATION_SEND_DELIVERY_OBSERVE_MS
      )
    }
  )

  it('claims nothing when the lane gave no answer', async () => {
    setup()
    vi.spyOn(runtime.structuredSendDeliveryWatch, 'observe').mockResolvedValue(undefined)

    expect(await send({ to: WORKER })).not.toHaveProperty('delivery')
  })

  it('claims nothing for a terminal agent the structured lane does not serve', async () => {
    setup()
    const observe = vi.spyOn(runtime.structuredSendDeliveryWatch, 'observe')

    expect(await send({ to: 'term_agent' })).not.toHaveProperty('delivery')
    await expect(observe.mock.results[0]?.value).resolves.toBeUndefined()
  })

  it('does not observe a group send', async () => {
    setup()
    const observe = vi
      .spyOn(runtime.structuredSendDeliveryWatch, 'observe')
      .mockResolvedValue('queued')

    expect(await send({ to: '@all' })).not.toHaveProperty('delivery')
    expect(observe).not.toHaveBeenCalled()
  })

  it.each([
    ['worker_done', { outcome: 'succeeded' }],
    ['heartbeat', undefined]
  ] as const)('does not observe a %s report', async (type, payload) => {
    setup()
    const observe = vi
      .spyOn(runtime.structuredSendDeliveryWatch, 'observe')
      .mockResolvedValue('queued')

    const receipt = await send({
      from: WORKER,
      senderPaneKey: WORKER_PANE,
      type,
      ...(payload ? { payload: JSON.stringify(payload) } : {})
    })

    expect(receipt).toMatchObject({ message: { type } })
    expect(receipt).not.toHaveProperty('delivery')
    expect(observe).not.toHaveBeenCalled()
  })

  it('replays a queued send without the live answer and without observing again', async () => {
    setup()
    const observe = vi
      .spyOn(runtime.structuredSendDeliveryWatch, 'observe')
      .mockResolvedValue('queued')
    const dispatcher = new RpcDispatcher({ runtime, methods: ORCHESTRATION_METHODS })
    const request: RpcRequest = {
      id: 'rpc_queued_1',
      authToken: 'test-token',
      method: 'orchestration.send',
      params: { from: 'term_coord', to: WORKER, subject: 'addendum' },
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION,
      orchestrationRequestId: 'retry_queued'
    }

    const first = await dispatcher.dispatch(request)
    const replayed = await dispatcher.dispatch({ ...request, id: 'rpc_queued_2' })

    expect(first).toMatchObject({ ok: true, result: { delivery: 'queued' } })
    expect(replayed).toMatchObject({ ok: true, result: { mutation: { replayed: true } } })
    expect(replayed.ok && replayed.result).not.toHaveProperty('delivery')
    expect(observe).toHaveBeenCalledTimes(1)
  })
})
