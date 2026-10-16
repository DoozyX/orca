import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const printResultMock = vi.hoisted(() => vi.fn())
vi.mock('../../format', () => ({ printResult: printResultMock }))

import { ORCHESTRATION_MESSAGE_WAIT_DEFAULT_TIMEOUT_MS } from '../../../shared/orchestration-message-wait-timeout'
import { RuntimeClientError } from '../../runtime-client'
import type { RuntimeClient } from '../../runtime-client'
import { CHECK_WAIT_PARENT_POLL_MS } from './check-wait-parent-watch'
import { CHECK_WAIT_RESUME_LIMIT } from './check-wait-resume'
import { ORCHESTRATION_CHECK_HANDLER } from './message-check-handler'

type CallOptions = { orchestrationRequestId?: string }
type SentCheck = { params: Record<string, unknown>; options?: CallOptions }

class ProcessExitCalled extends Error {}

const callMock = vi.fn()
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the check handler only uses client.call.
const client = { call: callMock } as unknown as RuntimeClient
const ORIGINAL_PPID = Object.getOwnPropertyDescriptor(process, 'ppid')
const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')

const RETRY_REQUEST_ID = '0f1e2d3c-4b5a-4968-8776-655443322110'

function waitFlags(
  extra: [string, string | boolean][] = [],
  timeout: string | null = '60000'
): Map<string, string | boolean> {
  return new Map<string, string | boolean>([
    ['terminal', 'term_coord'],
    ['wait', true],
    ['types', 'worker_done'],
    ...(timeout === null ? [] : [['timeout-ms', timeout] as const]),
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
  requestShow?: (params: unknown) => unknown
}): SentCheck[] {
  const sent: SentCheck[] = []
  callMock.mockImplementation(async (method: string, params: unknown, options?: CallOptions) => {
    if (method === 'orchestration.requestShow') {
      return handlers.requestShow?.(params)
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

  it('spends the default wait budget across a resume when --timeout-ms is omitted', async () => {
    vi.useFakeTimers({ now: 0 })
    const sent = respond({
      requestShow: requestShow('completed', LOST_RECEIPT),
      check: (checks) => {
        if (checks.length === 1) {
          vi.setSystemTime(ORCHESTRATION_MESSAGE_WAIT_DEFAULT_TIMEOUT_MS - 1_000)
          throw lostConnection('req_1')
        }
        return success({ runId: 'run_1', deliveryId: 'delivery_2', messages: [MESSAGE], count: 1 })
      }
    })

    await invokeCheck(waitFlags([], null))

    expect(sent).toHaveLength(2)
    expect(sent[0].params.timeoutMs).toBeUndefined()
    expect(sent[1].params.timeoutMs).toBe(1_000)
    expect(printedResult()).toMatchObject({ deliveryId: 'delivery_2' })
  })

  it('prints the lost receipt once the default wait budget is spent', async () => {
    vi.useFakeTimers({ now: 0 })
    const sent = respond({
      requestShow: requestShow('completed', LOST_RECEIPT),
      check: () => {
        vi.setSystemTime(ORCHESTRATION_MESSAGE_WAIT_DEFAULT_TIMEOUT_MS)
        throw lostConnection('req_1')
      }
    })

    await invokeCheck(waitFlags([], null))

    expect(sent).toHaveLength(1)
    expect(printedResult()).toMatchObject({ deliveryId: null, connectionLost: true, count: 0 })
  })

  it('resumes an explicit --retry-request wait under a fresh request id', async () => {
    const shownRequests: unknown[] = []
    const sent = respond({
      requestShow: (params) => {
        shownRequests.push(params)
        return requestShow('completed', LOST_RECEIPT)()
      },
      check: (checks) => {
        const requestId = checks.at(-1)?.options?.orchestrationRequestId
        if (checks.length === 1) {
          throw lostConnection(requestId ?? 'missing')
        }
        // The host replays a stored receipt for a reused id instead of waiting again.
        return requestId === RETRY_REQUEST_ID
          ? success({ ...LOST_RECEIPT, mutation: { requestId, replayed: true } })
          : success({ runId: 'run_1', deliveryId: 'delivery_2', messages: [MESSAGE], count: 1 })
      }
    })

    await invokeCheck(waitFlags([['retry-request', RETRY_REQUEST_ID]]))

    expect(sent).toHaveLength(2)
    expect(sent[0].options?.orchestrationRequestId).toBe(RETRY_REQUEST_ID)
    expect(shownRequests).toEqual([{ request: RETRY_REQUEST_ID }])
    expect(sent[1].options?.orchestrationRequestId).not.toBe(RETRY_REQUEST_ID)
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

describe('check --wait parent exit', () => {
  let parentPid = 4242
  const readParentPid = vi.fn(() => parentPid)

  beforeEach(() => {
    vi.useFakeTimers()
    callMock.mockReset()
    printResultMock.mockReset()
    readParentPid.mockClear()
    parentPid = 4242
    Object.defineProperty(process, 'ppid', { configurable: true, get: readParentPid })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (ORIGINAL_PPID) {
      Object.defineProperty(process, 'ppid', ORIGINAL_PPID)
    }
    if (ORIGINAL_PLATFORM) {
      Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM)
    }
  })

  function runOn(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  }

  it('exits an orphaned POSIX wait so its socket closes, without resuming', async () => {
    runOn('linux')
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new ProcessExitCalled()
    })
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    callMock.mockImplementation(() => new Promise(() => {}))

    void invokeCheck(waitFlags())
    await vi.waitFor(() => expect(callMock).toHaveBeenCalledTimes(1))
    expect(readParentPid).toHaveBeenCalled()
    parentPid = 1

    expect(() => vi.advanceTimersByTime(CHECK_WAIT_PARENT_POLL_MS)).toThrow(ProcessExitCalled)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(1)
    const orphanLines = stderr.mock.calls.filter(([line]) => String(line).includes('parent_exited'))
    expect(orphanLines).toHaveLength(1)
    expect(stderr.mock.invocationCallOrder.at(-1)).toBeLessThan(exit.mock.invocationCallOrder[0])
    expect(callMock).toHaveBeenCalledTimes(1)
    expect(callMock).toHaveBeenCalledWith('orchestration.check', expect.anything())
    expect(printResultMock).not.toHaveBeenCalled()
    expect(stdout).not.toHaveBeenCalled()
  })

  it('starts no parent watch and never exits a Windows wait', async () => {
    runOn('win32')
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new ProcessExitCalled()
    })
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    callMock.mockImplementation(() => new Promise(() => {}))

    void invokeCheck(waitFlags())
    await vi.waitFor(() => expect(callMock).toHaveBeenCalledTimes(1))
    parentPid = 1
    vi.advanceTimersByTime(CHECK_WAIT_PARENT_POLL_MS * 3)

    expect(readParentPid).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
    expect(stderr.mock.calls.some(([line]) => String(line).includes('parent_exited'))).toBe(false)
    expect(callMock).toHaveBeenCalledTimes(1)
  })

  it('starts no watch for a check without --wait', async () => {
    callMock.mockImplementation(() => new Promise(() => {}))

    void invokeCheck(new Map<string, string | boolean>([['terminal', 'term_coord']]))
    await vi.waitFor(() => expect(callMock).toHaveBeenCalledTimes(1))

    expect(vi.getTimerCount()).toBe(0)
    expect(readParentPid).not.toHaveBeenCalled()
  })
})
