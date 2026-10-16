import type { TuiAgent } from '../../shared/tui-agent'
import { isTuiAgent } from '../../shared/tui-agent-config'
import {
  LAUNCHED_AGENT_FOREGROUND_SAMPLE_MS,
  LAUNCHED_AGENT_FOREGROUND_SETTLE_MS
} from '../../shared/orchestration-timing-budgets'
import type { OrcaRuntimeService } from './orca-runtime'
import type { LaunchedAgentForeground } from './launched-agent-foreground'

/** A shell back at its prompt turns bracketed paste on, and Orca's shell integration marks it. */
const SHELL_RETURN_MARKERS = ['\x1b[?2004', '\x1b]133;'] as const
const MARKER_CARRY_CHARS = Math.max(...SHELL_RETURN_MARKERS.map((marker) => marker.length)) - 1

export type LaunchedAgentWriteGuardRuntime = Pick<
  OrcaRuntimeService,
  'readLaunchedAgentForeground' | 'subscribeToTerminalData'
> &
  Partial<Pick<OrcaRuntimeService, 'launchedAgentHostProvesAgent'>>

export type LaunchedAgentWriteGuard = {
  beforeWrite: (ptyId: string) => Promise<void>
  dispose: () => void
}

export class AgentNotInForegroundError extends Error {
  constructor(detail: string) {
    super(`agent_not_in_foreground: ${detail}`)
    this.name = 'AgentNotInForegroundError'
  }
}

/**
 * The check before each write of a launch prompt: the paste, its Enter, and Codex's second Enter.
 * A write needs a fresh read that finds the agent in front; a shell, or a host that cannot tell,
 * refuses it, since a ready signal alone can come from a shell back at its prompt. Once a read finds
 * the agent, later writes reuse it until the terminal shows a shell coming back to its prompt, so
 * Enter follows the paste on the desktop's timing instead of waiting out another process read.
 */
export function createLaunchedAgentWriteGuard(
  runtime: LaunchedAgentWriteGuardRuntime,
  agent: TuiAgent,
  /** `write-unless-shell`: on a host that cannot find the agent in front (Windows), only a shell
   *  proven in front refuses, so a caller that wrote there before keeps doing so.
   *  `settleDeadlineMs`: keep sampling a foreground that refuses until then, at most
   *  `LAUNCHED_AGENT_FOREGROUND_SETTLE_MS`; absent, one read decides. */
  {
    unprovableHost = 'refuse',
    settleDeadlineMs
  }: { unprovableHost?: 'refuse' | 'write-unless-shell'; settleDeadlineMs?: number } = {}
): LaunchedAgentWriteGuard {
  let cleared: { ptyId: string; shellMayHaveReturned: boolean; unsubscribe: () => void } | null =
    null
  const dispose = (): void => {
    cleared?.unsubscribe()
    cleared = null
  }
  const beforeWrite = async (ptyId: string): Promise<void> => {
    if (cleared?.ptyId === ptyId && !cleared.shellMayHaveReturned) {
      return
    }
    dispose()
    let carry = ''
    const watch = { ptyId, shellMayHaveReturned: false, unsubscribe: (): void => {} }
    // Subscribed before the read, so a shell that returns while it runs is not missed.
    watch.unsubscribe = runtime.subscribeToTerminalData(ptyId, (data) => {
      const window = carry + data
      carry = window.slice(-MARKER_CARRY_CHARS)
      if (SHELL_RETURN_MARKERS.some((marker) => window.includes(marker))) {
        watch.shellMayHaveReturned = true
      }
    })
    const startedAt = Date.now()
    const settleUntil =
      settleDeadlineMs === undefined
        ? startedAt
        : Math.min(startedAt + LAUNCHED_AGENT_FOREGROUND_SETTLE_MS, settleDeadlineMs)
    for (;;) {
      let foreground: LaunchedAgentForeground
      try {
        foreground = await runtime.readLaunchedAgentForeground(ptyId, agent)
      } catch (error) {
        watch.unsubscribe()
        throw error
      }
      if (foreground === 'agent') {
        cleared = watch
        return
      }
      if (
        foreground !== 'shell' &&
        unprovableHost === 'write-unless-shell' &&
        runtime.launchedAgentHostProvesAgent?.(ptyId) === false
      ) {
        watch.unsubscribe()
        return
      }
      const remainingMs = settleUntil - Date.now()
      // A shell back at its prompt is no wrapper about to exec the agent, so it ends the settle.
      if (watch.shellMayHaveReturned || remainingMs <= 0) {
        watch.unsubscribe()
        const shellReturned = watch.shellMayHaveReturned ? 'a shell came back to its prompt; ' : ''
        throw new AgentNotInForegroundError(
          `${shellReturned}last foreground sample was ${foreground} after ${Date.now() - startedAt} ms`
        )
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(LAUNCHED_AGENT_FOREGROUND_SAMPLE_MS, remainingMs))
      )
    }
  }
  return { beforeWrite, dispose }
}

/**
 * The check before a worker start writes its brief into the agent it just launched, as a launch
 * prompt's write is checked; null for a terminal the caller supplied, which no launch put an agent in.
 * Its foreground may settle until `readinessDeadlineMs`: the wrapper that launched the agent can
 * still lead the foreground for a read after the agent's ready signal (#18, #19).
 */
export function createWorkerBriefWriteGuard(
  runtime: LaunchedAgentWriteGuardRuntime,
  agent: string | null | undefined,
  freshLaunch: boolean,
  readinessDeadlineMs: number
): LaunchedAgentWriteGuard | null {
  return freshLaunch && isTuiAgent(agent)
    ? createLaunchedAgentWriteGuard(runtime, agent, {
        unprovableHost: 'write-unless-shell',
        settleDeadlineMs: readinessDeadlineMs
      })
    : null
}
