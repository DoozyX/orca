import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const printResultMock = vi.hoisted(() => vi.fn())
vi.mock('../../format', () => ({ printResult: printResultMock }))

import { RuntimeClientError } from '../../runtime-client'
import type { RuntimeClient } from '../../runtime-client'
import { CHECK_WAIT_RESUME_LIMIT } from './check-wait-resume'
import { ORCHESTRATION_CHECK_HANDLER } from './message-check-handler'

type CallOptions = { orchestrationRequestId?: string }
type SentCheck = { params: Record<string, unknown>; options?: CallOptions }

const callMock = vi.fn()
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the check handler only uses client.call.
const client = { call: callMock } as unknown as RuntimeClient

function waitFlags(extra: [string, string | boolean][] = []): Map<string, string | boolean> {
  return new Map<string, string | boolean>([
    ['terminal', 'term_coord'],
    ['wait', true],
    ['types', 'worker_done'],
    ['timeout-ms', '60000'],
    ...extra
  ])
}

function invokeCheck(flags: Map<string, string | boolean>): Promise<void> {
  return ORCHESTRATION_CHECK_HANDLER['orchestration check']({
    flags,
    client,
    cwd: '/tmp/repo',
    json: true
  })
}

function lostConnection(requestId: string): RuntimeClientError {
  return new RuntimeClientError(
    'runtime_unavailable',
    'The Orca runtime closed the connection before responding. Restart Orca and try again.',
    {
      orchestrationRequestId: requestId,
      originalCommand: ['orca', 'orchestration', 'check', '--wait']
    }
  )
}

function success(result: unknown) {
  return { id: 'rpc', ok: true, result, _meta: { runtimeId: 'runtime_1' } }
}

const LOST_RECEIPT = {
  runId: 'run_1',
  deliveryId: null,
  messages: [],
  count: 0,
  acknowledged: 'delivery_acked',
  timedOut: false,
  cancelled: true,
  connectionLost: true,
  mutation: { requestId: 'req_1', replayed: false }
}
const MESSAGE = {
  id: 'msg_1',
  from_handle: 'term_worker',
  to_handle: 'run:run_1',
  subject: 'done',
  body: '',
  type: 'worker_done',
  read: 0
}

function respond(handlers: {
  check: (sent: SentCheck[]) => unknown
  requestShow?: () => unknown
}): SentCheck[] {
  const sent: SentCheck[] = []
  callMock.mockImplementation(async (method: string, params: unknown, options?: CallOptions) => {
    if (method === 'orchestration.requestShow') {
      return handlers.requestShow?.()
    }
    sent.push({
      params:
        typeof params === 'object' && params !== null
          ? Object.fromEntries(Object.entries(params))
          : {},
      options
    })
    return handlers.check(sent)
  })
  return sent
}

function requestShow(state: 'completed' | 'pending' | 'absent', receipt?: unknown) {
  return () =>
    success({ requestId: 'req_1', state, ...(receipt ? { receipt } : {}), interpretation: '' })
}

function printedResult(): unknown {
  expect(printResultMock).toHaveBeenCalledTimes(1)
  return printResultMock.mock.calls[0][0].result
}

describe('check --wait resume after a dropped connection', () => {
  beforeEach(() => {
    callMock.mockReset()
    printResultMock.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resumes an empty connectionLost wait with a fresh request and the remaining timeout', async () => {
    vi.useFakeTimers({ now: 0 })
    const sent = respond({
      requestShow: requestShow('completed', LOST_RECEIPT),
      check: (checks) => {
        if (checks.length === 1) {
          vi.setSystemTime(5_000)
          throw lostConnection('req_1')
        }
        return success({ runId: 'run_1', deliveryId: 'delivery_2', messages: [MESSAGE], count: 1 })
      }
    })

    await invokeCheck(waitFlags([['ack', 'delivery_acked']]))

    expect(sent).toHaveLength(2)
    expect(sent[0].params).toMatchObject({ ack: 'delivery_acked', timeoutMs: 60_000 })
    expect(sent[1].options?.orchestrationRequestId).not.toBe('req_1')
    expect(sent[1].params.ack).toBeUndefined()
    expect(sent[1].params.timeoutMs).toBeLessThanOrEqual(55_000)
    expect(printedResult()).toMatchObject({ deliveryId: 'delivery_2', count: 1 })
  })

  it('prints a completed receipt that already holds a Delivery without checking again', async () => {
    const receipt = { ...LOST_RECEIPT, deliveryId: 'delivery_1', messages: [MESSAGE], count: 1 }
    const sent = respond({
      requestShow: requestShow('completed', {
        ...receipt,
        connectionLost: false,
        cancelled: false
      }),
      check: () => {
        throw lostConnection('req_1')
      }
    })

    await invokeCheck(waitFlags())

    expect(sent).toHaveLength(1)
    expect(printedResult()).toMatchObject({ deliveryId: 'delivery_1', count: 1 })
  })

  it.each([
    [
      'an older server without request-show',
      () => {
        throw new RuntimeClientError('method_not_found', 'Unknown method')
      }
    ],
    ['a pending receipt', requestShow('pending')],
    ['an absent receipt', requestShow('absent')]
  ])('keeps the outcome_unknown recovery error for %s', async (_label, show) => {
    const sent = respond({
      requestShow: show,
      check: () => {
        throw lostConnection('req_1')
      }
    })

    await expect(invokeCheck(waitFlags())).rejects.toMatchObject({
      code: 'runtime_unavailable',
      data: { orchestrationRequestId: 'req_1', recovery: { disposition: 'outcome_unknown' } }
    })
    expect(sent).toHaveLength(1)
    expect(printResultMock).not.toHaveBeenCalled()
  })

  it('throws the last error after the resume limit', async () => {
    const sent = respond({
      requestShow: requestShow('completed', LOST_RECEIPT),
      check: (checks) => {
        throw lostConnection(`req_${checks.length}`)
      }
    })

    await expect(invokeCheck(waitFlags())).rejects.toMatchObject({
      data: {
        orchestrationRequestId: `req_${CHECK_WAIT_RESUME_LIMIT + 1}`,
        recovery: { disposition: 'outcome_unknown' }
      }
    })
    expect(sent).toHaveLength(CHECK_WAIT_RESUME_LIMIT + 1)
  })

  it('never resumes a check without --wait', async () => {
    const requestShowSpy = vi.fn(requestShow('completed', LOST_RECEIPT))
    const sent = respond({
      requestShow: requestShowSpy,
      check: () => {
        throw lostConnection('req_1')
      }
    })

    await expect(
      invokeCheck(new Map<string, string | boolean>([['terminal', 'term_coord']]))
    ).rejects.toMatchObject({ data: { recovery: { disposition: 'outcome_unknown' } } })
    expect(sent).toHaveLength(1)
    expect(requestShowSpy).not.toHaveBeenCalled()
  })
})
