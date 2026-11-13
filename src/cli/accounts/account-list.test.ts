import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_HANDLERS } from './account'
import type { HandlerContext } from '../dispatch/dispatch'
import type { RuntimeClient } from '../runtime/client'

describe('account list CLI handler', () => {
  const callMock = vi.fn()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: account list reads only client.call, which the stub provides.
  const client = { call: callMock } as unknown as RuntimeClient
  let logSpy: ReturnType<typeof vi.spyOn>

  function context(agent: string): HandlerContext {
    return {
      client,
      cwd: process.cwd(),
      flags: new Map([['agent', agent]]),
      json: false,
      rawArgs: []
    }
  }

  beforeEach(() => {
    callMock.mockReset()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks an account selected for WSL as active in human output', async () => {
    callMock.mockResolvedValue({
      id: 'test',
      ok: true,
      result: {
        claude: {
          accounts: [{ id: 'claude-wsl', email: 'claude@example.com' }],
          activeAccountId: null,
          activeAccountIdsByRuntime: { host: null, wsl: { Ubuntu: 'claude-wsl' } }
        },
        codex: { accounts: [], activeAccountId: null }
      },
      _meta: { runtimeId: 'test-runtime' }
    })

    await ACCOUNT_HANDLERS['account list']({ ...context('claude'), flags: new Map() })

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('claude@example.com (active)'))
  })

  it('tells the user which saved Claude accounts need a fresh sign-in', async () => {
    callMock.mockResolvedValue({
      id: 'test',
      ok: true,
      result: {
        claude: {
          accounts: [
            { id: 'old', email: 'old@example.com', needsSignIn: true },
            { id: 'ok', email: 'ok@example.com' }
          ],
          activeAccountId: 'old'
        },
        codex: { accounts: [], activeAccountId: null }
      },
      _meta: { runtimeId: 'test-runtime' }
    })

    await ACCOUNT_HANDLERS['account list']({ ...context('claude'), flags: new Map() })

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '  old  old@example.com (active) (sign in again in Orca Settings > AI Provider Accounts)\n  ok  ok@example.com\n'
      )
    )
  })

  it('lists accounts without forcing a provider usage refresh', async () => {
    callMock.mockResolvedValue({
      id: 'test',
      ok: true,
      result: {
        claude: { accounts: [], activeAccountId: null },
        codex: { accounts: [], activeAccountId: null }
      },
      _meta: { runtimeId: 'test-runtime' }
    })

    await ACCOUNT_HANDLERS['account list']({ ...context('claude'), flags: new Map() })

    expect(callMock).toHaveBeenCalledWith('accounts.list', { refreshUsage: false })
  })

  it('refreshes quota explicitly for routing before returning JSON', async () => {
    callMock.mockResolvedValue({
      id: 'test',
      ok: true,
      result: {
        claude: { accounts: [], activeAccountId: null },
        codex: { accounts: [], activeAccountId: null },
        rateLimits: { omp: { status: 'ok', daily: { usedPercent: 6 } } }
      },
      _meta: { runtimeId: 'test-runtime' }
    })

    await ACCOUNT_HANDLERS['account list']({
      ...context('claude'),
      json: true,
      flags: new Map([['refresh-usage', true]])
    })

    expect(callMock).toHaveBeenCalledWith('accounts.list', { refreshUsage: true })
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"rateLimits"'))
  })
})
