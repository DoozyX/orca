import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LaunchedAgentForeground } from './launched-agent-foreground'
import {
  createLaunchedAgentWriteGuard,
  createWorkerBriefWriteGuard,
  type LaunchedAgentWriteGuardRuntime
} from './launched-agent-write-guard'
import {
  LAUNCHED_AGENT_FOREGROUND_SAMPLE_MS,
  LAUNCHED_AGENT_FOREGROUND_SETTLE_MS
} from '../../shared/orchestration-timing-budgets'

function guardHarness(foregrounds: LaunchedAgentForeground[]) {
  const answers = [...foregrounds]
  let listener: ((data: string) => void) | null = null
  const unsubscribe = vi.fn(() => {
    listener = null
  })
  const runtime: LaunchedAgentWriteGuardRuntime = {
    readLaunchedAgentForeground: vi.fn(
      async (): Promise<LaunchedAgentForeground> => answers.shift() ?? 'agent'
    ),
    subscribeToTerminalData: vi.fn((_ptyId: string, next: (data: string) => void) => {
      listener = next
      return unsubscribe
    })
  }
  const guard = createLaunchedAgentWriteGuard(runtime, 'claude')
  return { runtime, guard, unsubscribe, emit: (data: string) => listener?.(data) }
}

describe('the check before each write of a launch prompt', () => {
  it('reuses a read that found the agent for the writes after it', async () => {
    const { runtime, guard } = guardHarness(['agent'])

    await guard.beforeWrite('pty-1')
    // The agent's own output after the paste says nothing about a shell.
    await guard.beforeWrite('pty-1')
    await guard.beforeWrite('pty-1')

    expect(runtime.readLaunchedAgentForeground).toHaveBeenCalledTimes(1)
  })

  // Why: a ready signal can come from a shell whose agent exited, so only a read that finds the
  // agent may let the text through; an unanswered read is not that.
  it.each(['shell', 'unknown'] as const)(
    'refuses a write when the read finds %s',
    async (found) => {
      const { runtime, guard, unsubscribe } = guardHarness([found])

      await expect(guard.beforeWrite('pty-1')).rejects.toThrow('agent_not_in_foreground')
      expect(unsubscribe).toHaveBeenCalledTimes(1)
      // A launch prompt never settles: one read decides.
      expect(runtime.readLaunchedAgentForeground).toHaveBeenCalledTimes(1)
    }
  )

  it.each([
    ['a shell turning bracketed paste on', '$ \x1b[?2004h'],
    ['a shell integration prompt mark', '\x1b]133;D;1\x07\x1b]133;A\x07$ '],
    ['a mark split across two chunks', ['\x1b[?20', '04h']]
  ] as const)('reads again after %s, and refuses a shell', async (_label, output) => {
    const { runtime, guard, emit } = guardHarness(['agent', 'shell'])

    await guard.beforeWrite('pty-1')
    for (const chunk of typeof output === 'string' ? [output] : output) {
      emit(chunk)
    }

    await expect(guard.beforeWrite('pty-1')).rejects.toThrow('agent_not_in_foreground')
    expect(runtime.readLaunchedAgentForeground).toHaveBeenCalledTimes(2)
  })

  it('catches a shell that returns while the first read is still running', async () => {
    const { runtime, guard, emit } = guardHarness([])
    vi.mocked(runtime.readLaunchedAgentForeground)
      .mockImplementationOnce(async () => {
        emit('\x1b[?2004h')
        return 'agent'
      })
      .mockResolvedValueOnce('shell')

    await guard.beforeWrite('pty-1')

    await expect(guard.beforeWrite('pty-1')).rejects.toThrow('agent_not_in_foreground')
  })

  it('stops watching when it refuses and when it is disposed', async () => {
    const refused = guardHarness(['shell'])
    await expect(refused.guard.beforeWrite('pty-1')).rejects.toThrow('agent_not_in_foreground')
    expect(refused.unsubscribe).toHaveBeenCalledTimes(1)

    const cleared = guardHarness(['agent'])
    await cleared.guard.beforeWrite('pty-1')
    cleared.guard.dispose()
    expect(cleared.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

// #18/#19: a worker brief's first read can catch the agent's wrapper (a `node` shim that has not
// exec'd yet) in front for one sample after readiness, so it keeps sampling within a bounded window.
describe('the check before a worker brief is written into the agent it launched', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function briefHarness(foregrounds: LaunchedAgentForeground[], readinessBudgetMs = 60_000) {
    vi.useFakeTimers()
    const { runtime, unsubscribe, emit } = guardHarness(foregrounds)
    const guard = createWorkerBriefWriteGuard(
      runtime,
      'codex',
      true,
      Date.now() + readinessBudgetMs
    )
    if (!guard) {
      throw new Error('a fresh launch arms the brief guard')
    }
    return { runtime, guard, unsubscribe, emit }
  }

  it.each([
    ['an unanswered read', ['unknown', 'unknown', 'agent']],
    ['a shell that never printed a prompt', ['shell', 'agent']]
  ] as const)('writes once the agent comes to the front after %s', async (_label, answers) => {
    const { runtime, guard } = briefHarness([...answers])

    const pending = guard.beforeWrite('pty-1')
    await vi.advanceTimersByTimeAsync(LAUNCHED_AGENT_FOREGROUND_SAMPLE_MS * answers.length)

    await expect(pending).resolves.toBeUndefined()
    expect(runtime.readLaunchedAgentForeground).toHaveBeenCalledTimes(answers.length)
  })

  it('refuses at once when a shell comes back to its prompt during the window', async () => {
    const { runtime, guard, emit } = briefHarness([])
    vi.mocked(runtime.readLaunchedAgentForeground).mockResolvedValue('shell')

    const startedAt = Date.now()
    const pending = guard.beforeWrite('pty-1')
    const refused = expect(pending).rejects.toThrow(
      /^agent_not_in_foreground: a shell came back to its prompt/
    )
    await vi.advanceTimersByTimeAsync(0)
    emit('$ \x1b[?2004h')
    await vi.advanceTimersByTimeAsync(LAUNCHED_AGENT_FOREGROUND_SAMPLE_MS)

    await refused
    expect(Date.now() - startedAt).toBe(LAUNCHED_AGENT_FOREGROUND_SAMPLE_MS)
    expect(runtime.readLaunchedAgentForeground).toHaveBeenCalledTimes(2)
  })

  it('refuses a shell still in front when the window ends, naming the last read', async () => {
    const { runtime, guard, unsubscribe } = briefHarness([])
    vi.mocked(runtime.readLaunchedAgentForeground).mockResolvedValue('shell')

    const pending = guard.beforeWrite('pty-1')
    const refused = expect(pending).rejects.toThrow(
      `agent_not_in_foreground: last foreground sample was shell after ${LAUNCHED_AGENT_FOREGROUND_SETTLE_MS} ms`
    )
    await vi.advanceTimersByTimeAsync(LAUNCHED_AGENT_FOREGROUND_SETTLE_MS)

    await refused
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('never settles past what is left of the readiness budget', async () => {
    const { runtime, guard } = briefHarness([], 1_000)
    vi.mocked(runtime.readLaunchedAgentForeground).mockResolvedValue('unknown')

    const pending = guard.beforeWrite('pty-1')
    const refused = expect(pending).rejects.toThrow(
      'agent_not_in_foreground: last foreground sample was unknown after 1000 ms'
    )
    await vi.advanceTimersByTimeAsync(1_000)

    await refused
  })
})
