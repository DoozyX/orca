import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const callMock = vi.fn()

vi.mock('../runtime/client', () => {
  class RuntimeClient {
    call = callMock
    getCliStatus = vi.fn()
    openOrca = vi.fn()
  }
  return { RuntimeClient }
})

import { main } from '../index'
import { RuntimeConnectionClosedError } from '../runtime/transport'
import { okFixture } from '../runtime/fixtures/runtime-rpc-fixtures'

// #28: a hung page stalls a bridge call until the socket closes; the runtime itself is fine.
describe('orca cli browser commands interrupted by a closed connection', () => {
  const statusFixture = okFixture('req_status', { runtimeId: 'runtime-1' })
  const snapshotFixture = okFixture('req_snapshot', {
    browserPageId: 'page-1',
    snapshot: 'tree',
    refs: [],
    url: 'https://example.com',
    title: 'Example'
  })

  beforeEach(() => {
    callMock.mockReset()
    process.exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  function jsonError(logSpy: { mock: { calls: unknown[][] } }): { code: string; message: string } {
    const printed: unknown = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]))
    if (!printed || typeof printed !== 'object' || !('error' in printed)) {
      throw new TypeError('expected a JSON error envelope')
    }
    const { error } = printed
    if (!error || typeof error !== 'object' || !('code' in error) || !('message' in error)) {
      throw new TypeError('expected an error code and message')
    }
    return { code: String(error.code), message: String(error.message) }
  }

  it('retries a snapshot once after a close while the runtime still answers', async () => {
    callMock
      .mockRejectedValueOnce(new RuntimeConnectionClosedError())
      .mockResolvedValueOnce(statusFixture)
      .mockResolvedValueOnce(snapshotFixture)
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['snapshot', '--page', 'page-1', '--json'], '/tmp/not-an-orca-worktree')

    expect(callMock.mock.calls.map((call) => call[0])).toEqual([
      'browser.snapshot',
      'status.get',
      'browser.snapshot'
    ])
    expect(process.exitCode).toBeUndefined()
  })

  it('fails browser_command_interrupted after a second close', async () => {
    callMock
      .mockRejectedValueOnce(new RuntimeConnectionClosedError())
      .mockResolvedValueOnce(statusFixture)
      .mockRejectedValueOnce(new RuntimeConnectionClosedError())
      .mockResolvedValueOnce(statusFixture)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['snapshot', '--page', 'page-1', '--json'], '/tmp/not-an-orca-worktree')

    expect(callMock.mock.calls.filter((call) => call[0] === 'browser.snapshot')).toHaveLength(2)
    const error = jsonError(logSpy)
    expect(error.code).toBe('browser_command_interrupted')
    expect(error.message).toContain('page page-1')
    expect(error.message).toContain('runtime is reachable')
    expect(process.exitCode).toBe(1)
  })

  it('retries a selector wait once after a close while the runtime still answers', async () => {
    callMock
      .mockRejectedValueOnce(new RuntimeConnectionClosedError())
      .mockResolvedValueOnce(statusFixture)
      .mockResolvedValueOnce(okFixture('req_wait', { matched: true }))
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(
      ['wait', '--selector', '#ready', '--page', 'page-1', '--json'],
      '/tmp/not-an-orca-worktree'
    )

    expect(callMock.mock.calls.map((call) => call[0])).toEqual([
      'browser.wait',
      'status.get',
      'browser.wait'
    ])
    expect(process.exitCode).toBeUndefined()
  })

  it.each([
    ['goto', ['goto', '--url', 'https://example.com'], 'browser.goto'],
    // A --delta snapshot moves the baseline, so a resend would report no change.
    ['snapshot --delta', ['snapshot', '--delta'], 'browser.snapshot'],
    ['viewport', ['viewport', '--width', '375', '--height', '812'], 'browser.viewport'],
    // A --fn expression is arbitrary page JavaScript: running it twice can repeat its side effects.
    ['wait --fn', ['wait', '--fn', '(++globalThis.effects, true)'], 'browser.wait']
  ])('never retries %s', async (_label, argv, method) => {
    callMock
      .mockRejectedValueOnce(new RuntimeConnectionClosedError())
      .mockResolvedValueOnce(statusFixture)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main([...argv, '--page', 'page-1', '--json'], '/tmp/not-an-orca-worktree')

    expect(callMock.mock.calls.map((call) => call[0])).toEqual([method, 'status.get'])
    expect(jsonError(logSpy).code).toBe('browser_command_interrupted')
  })

  it('stays runtime_unavailable when the status probe also fails', async () => {
    callMock
      .mockRejectedValueOnce(new RuntimeConnectionClosedError())
      .mockRejectedValueOnce(new RuntimeConnectionClosedError())
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['snapshot', '--page', 'page-1', '--json'], '/tmp/not-an-orca-worktree')

    expect(callMock.mock.calls.map((call) => call[0])).toEqual(['browser.snapshot', 'status.get'])
    expect(jsonError(logSpy).code).toBe('runtime_unavailable')
  })
})
