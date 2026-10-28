import type { TuiAgent } from '../../shared/tui-agent'
import { isTuiAgent } from '../../shared/tui-agent-config'
import {
  LAUNCHED_AGENT_FOREGROUND_SAMPLE_MS,
  LAUNCHED_AGENT_FOREGROUND_SETTLE_MS
} from '../../shared/orchestration-timing-budgets'
import type { OrcaRuntimeService } from './orca-runtime'
import type { LaunchedAgentForeground } from './launched-agent-foreground'

const SHELL_RETURN_MARKERS = ['\x1b[?2004', '\x1b]133;'] as const
const MARKER_CARRY_CHARS = Math.max(...SHELL_RETURN_MARKERS.map((marker) => marker.length)) - 1

export type LaunchedAgentWriteGuardRuntime = Pick<
  OrcaRuntimeService,
  'readLaunchedAgentForeground' | 'subscribeToTerminalData'
> &
  Partial<
    Pick<OrcaRuntimeService, 'launchedAgentHostProvesAgent' | 'launchedAgentHostProvesShellAlone'>
  >

/** refuse: write only on agent proof. write-unless-shell: permit unknown. write-if-shell-provable: permit unknown only where a lone shell is provable. */
export type UnprovableHostPolicy = 'refuse' | 'write-unless-shell' | 'write-if-shell-provable'

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

/** Require fresh agent foreground before the first prompt write; ready signals can be shell prompts.
 * Reuse that proof for Enter until terminal output signals shell return, preserving paste timing. */
export function createLaunchedAgentWriteGuard(
  runtime: LaunchedAgentWriteGuardRuntime,
  agent: TuiAgent,
  /** `settleDeadlineMs`: keep sampling a refusing foreground until then, capped at
   *  `LAUNCHED_AGENT_FOREGROUND_SETTLE_MS`; absent, one read decides. */
  {
    unprovableHost = 'refuse',
    settleDeadlineMs
  }: { unprovableHost?: UnprovableHostPolicy; settleDeadlineMs?: number } = {}
): LaunchedAgentWriteGuard {
  let disposed = false
  let current: {
    ptyId: string
    proven: boolean
    shellMayHaveReturned: boolean
    unsubscribe: () => void
  } | null = null
  const clearWatch = (): void => {
    const previous = current
    current = null
    previous?.unsubscribe()
  }
  const dispose = (): void => {
    disposed = true
    clearWatch()
  }
  const beforeWrite = async (ptyId: string): Promise<void> => {
    if (disposed) {
      throw new Error('request_aborted')
    }
    if (current?.ptyId === ptyId && current.proven && !current.shellMayHaveReturned) {
      return
    }
    clearWatch()
    let carry = ''
    const watch = { ptyId, proven: false, shellMayHaveReturned: false, unsubscribe: (): void => {} }
    current = watch
    // Subscribe before probing so shell return during the read cannot be missed.
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
    const refusal = (foreground: LaunchedAgentForeground): AgentNotInForegroundError => {
      const shellReturned = watch.shellMayHaveReturned ? 'a shell came back to its prompt; ' : ''
      return new AgentNotInForegroundError(
        `${shellReturned}last foreground sample was ${foreground} after ${Date.now() - startedAt} ms`
      )
    }
    try {
      for (;;) {
        const foreground: LaunchedAgentForeground = await runtime.readLaunchedAgentForeground(
          ptyId,
          agent
        )
        if (disposed || current !== watch) {
          throw new Error('request_aborted')
        }
        // While settling, a returned shell outranks the sample: a read can still name the exiting agent.
        if (settleDeadlineMs !== undefined && watch.shellMayHaveReturned) {
          throw refusal(foreground)
        }
        if (foreground === 'agent') {
          watch.proven = true
          return
        }
        if (
          foreground !== 'shell' &&
          unprovableHost !== 'refuse' &&
          runtime.launchedAgentHostProvesAgent?.(ptyId) === false &&
          (unprovableHost === 'write-unless-shell' ||
            runtime.launchedAgentHostProvesShellAlone?.(ptyId) === true)
        ) {
          clearWatch()
          return
        }
        const remainingMs = settleUntil - Date.now()
        // A shell back at its prompt is no wrapper about to exec the agent, so it ends the settle.
        if (watch.shellMayHaveReturned || remainingMs <= 0) {
          throw refusal(foreground)
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(LAUNCHED_AGENT_FOREGROUND_SAMPLE_MS, remainingMs))
        )
        if (disposed || current !== watch) {
          throw new Error('request_aborted')
        }
      }
    } catch (error) {
      if (current === watch) {
        clearWatch()
      }
      throw error
    }
  }
  return { beforeWrite, dispose }
}

/** Fresh worker launches share prompt-write guards; caller-supplied terminals have no launch to guard.
 * Settles until `readinessDeadlineMs`: the launching wrapper can still lead after the ready signal (#18, #19). */
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
