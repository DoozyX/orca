import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }))

vi.mock('../runtime-client', async () => {
  // Why: re-export the REAL error classes so format.ts `instanceof` narrowing still matches.
  const { RuntimeClientError, RuntimeRpcFailureError } = await import('../runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = callMock
    getCliStatus = vi.fn()
    openOrca = vi.fn()
  }
  return {
    RuntimeClient,
    RuntimeClientError,
    RuntimeRpcFailureError,
    serveOrcaApp: vi.fn(),
    getDefaultUserDataPath: vi.fn(() => '/tmp/orca-user-data')
  }
})

import { main } from '../index'
import { RuntimeClientError } from '../runtime/types'
import { okFixture, queueFixtures } from '../test-fixtures'

const KEY = 'sim:iphone-17-pro'
const UNTIL = Date.UTC(2026, 9, 17, 12, 0, 0)
const UNTIL_ISO = '2026-10-17T12:00:00.000Z'
const HOLDER = { runId: 'run_a', acquiredAt: UNTIL - 600_000, expiresAt: UNTIL }
const ENV_NAMES = ['ORCA_TERMINAL_HANDLE', 'ORCA_PANE_KEY', 'ORCA_STRUCTURED_SESSION'] as const
const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]))

describe('orchestration lease commands', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    callMock.mockReset()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const name of ENV_NAMES) {
      delete process.env[name]
    }
    process.exitCode = 0
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    for (const name of ENV_NAMES) {
      const value = originalEnv[name]
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
    process.exitCode = 0
  })

  const paramsFor = (method: string): unknown =>
    callMock.mock.calls.find((call) => call[0] === method)?.[1]
  const stdout = (): string => logSpy.mock.calls.map((call) => String(call[0])).join('\n')
  const stderr = (): string => errorSpy.mock.calls.map((call) => String(call[0])).join('\n')

  async function lease(verb: string, ...flags: string[]): Promise<void> {
    await main(['orchestration', 'lease', verb, '--resource', KEY, ...flags], '/tmp/repo')
  }

  it('acquires with the TTL and the caller identity of the bound coordinator', async () => {
    process.env.ORCA_TERMINAL_HANDLE = 'term_coord'
    queueFixtures(
      callMock,
      okFixture('req_identity', { identity: { handle: 'term_coord', live: true } }),
      okFixture('req_lease', { status: 'acquired', holder: HOLDER })
    )

    await lease('acquire', '--ttl-ms', '600000', '--json')

    expect(process.exitCode).toBe(0)
    expect(paramsFor('orchestration.leaseAcquire')).toEqual({
      resource: KEY,
      ttlMs: 600_000,
      from: 'term_coord'
    })
    expect(JSON.parse(stdout())).toMatchObject({ result: { status: 'acquired', holder: HOLDER } })
  })

  it('says a queued acquire waits behind the holder', async () => {
    queueFixtures(
      callMock,
      okFixture('req_lease', { status: 'queued', position: 1, holder: HOLDER })
    )

    await lease('acquire', '--from', 'term_coord')

    expect(process.exitCode).toBe(0)
    expect(stdout()).toBe(`Queued for ${KEY} at position 1; held by run_a until ${UNTIL_ISO}.`)
  })

  it.each(['acquired', 'renewed'])('says an %s lease is held until it expires', async (status) => {
    queueFixtures(callMock, okFixture('req_lease', { status, holder: HOLDER }))

    await lease('acquire', '--from', 'term_coord')

    expect(stdout()).toBe(`Holding ${KEY} until ${UNTIL_ISO}.`)
  })

  it.each([
    [
      { status: 'released', promoted: { ...HOLDER, runId: 'run_b' } },
      `Released ${KEY}; run_b holds it until ${UNTIL_ISO}.`
    ],
    [{ status: 'released', promoted: null }, `Released ${KEY}; no Run is waiting for it.`],
    [{ status: 'dequeued' }, `Left the queue for ${KEY}.`],
    [{ status: 'not_held' }, `This Run neither holds nor waits for ${KEY}.`]
  ])('releases for the caller and reports %o', async (result, text) => {
    queueFixtures(callMock, okFixture('req_lease', result))

    await lease('release', '--run', 'run_a', '--from', 'term_coord')

    expect(process.exitCode).toBe(0)
    expect(paramsFor('orchestration.leaseRelease')).toEqual({
      resource: KEY,
      run: 'run_a',
      from: 'term_coord'
    })
    expect(stdout()).toBe(text)
  })

  it('shows the holder and one line per waiter without naming a caller', async () => {
    queueFixtures(
      callMock,
      okFixture('req_show', {
        resourceKey: KEY,
        holder: { ...HOLDER, expired: false },
        next: { runId: 'run_b', ttlMs: 60_000 },
        waiters: [
          { runId: 'run_b', position: 1, ttlMs: 60_000, enqueuedAt: HOLDER.acquiredAt },
          { runId: 'run_c', position: 2, ttlMs: 90_000, enqueuedAt: HOLDER.acquiredAt }
        ]
      })
    )

    await lease('show')

    expect(process.exitCode).toBe(0)
    expect(callMock).toHaveBeenCalledTimes(1)
    expect(callMock).toHaveBeenCalledWith('orchestration.leaseShow', { resource: KEY })
    expect(stdout()).toBe(
      [
        `Held by run_a until ${UNTIL_ISO}.`,
        'Waiting 1: run_b for 60000 ms.',
        'Waiting 2: run_c for 90000 ms.'
      ].join('\n')
    )
  })

  it.each([
    [
      { runId: 'run_b', ttlMs: 60_000 },
      `Held by run_a; expired at ${UNTIL_ISO}. The next acquire or release hands it to run_b.`
    ],
    [null, `Held by run_a; expired at ${UNTIL_ISO}. The next acquire takes it.`]
  ])('shows an expired holder with the next waiter %o', async (next, holderLine) => {
    const waiters = next ? [{ ...next, position: 1, enqueuedAt: HOLDER.acquiredAt }] : []
    queueFixtures(
      callMock,
      okFixture('req_show', {
        resourceKey: KEY,
        holder: { ...HOLDER, expired: true },
        next,
        waiters
      })
    )

    await lease('show')

    expect(stdout().split('\n')[0]).toBe(holderLine)
  })

  it('shows a resource nobody holds as free', async () => {
    queueFixtures(
      callMock,
      okFixture('req_show', { resourceKey: KEY, holder: null, next: null, waiters: [] })
    )

    await lease('show')

    expect(stdout()).toBe(`${KEY} is free.`)
  })

  it('names the lease method when an older host does not know it', async () => {
    callMock.mockRejectedValue(
      new RuntimeClientError('method_not_found', 'Unknown method: orchestration.leaseAcquire')
    )

    await lease('acquire', '--from', 'term_coord', '--json')

    expect(process.exitCode).toBe(1)
    expect(JSON.parse(stdout())).toMatchObject({
      ok: false,
      error: {
        code: 'incompatible_runtime',
        message: expect.stringContaining('orchestration.leaseAcquire')
      }
    })
  })

  it('refuses an unknown flag before calling the host', async () => {
    await lease('acquire', '--from', 'term_coord', '--ttl', '600000')

    expect(process.exitCode).toBe(1)
    expect(stderr()).toContain('Unknown flag --ttl for command: orchestration lease acquire')
    expect(callMock).not.toHaveBeenCalled()
  })
})
