import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { RuntimeTerminalWait } from '../../../../shared/runtime-terminal-contracts'
import type { OrcaRuntimeService } from '../../orca-runtime'
import {
  waitForWorkerAgentReady,
  type LaunchedAgentReadinessRuntime,
  type TerminalReadinessCreation
} from './launched-agent-composer-readiness'

export type WorkerAgentReadinessRebindRuntime = LaunchedAgentReadinessRuntime &
  Pick<OrcaRuntimeService, 'getTerminalHandleForPaneKey' | 'getTerminalProcessIncarnation'>

/**
 * `waitForWorkerAgentReady`, once more on the pane's new handle when the wait reports its handle
 * stale: a session-graph reload remints a live pane's handle (#29). Only the same process counts,
 * so the pane key and process incarnation are read before the wait, and it re-resolves once.
 */
export async function waitForWorkerAgentReadyRebinding(
  runtime: WorkerAgentReadinessRebindRuntime,
  handle: string,
  args: {
    agent: TuiAgent | undefined
    reusesTerminal: boolean
    timeoutMs: number
    creation?: TerminalReadinessCreation
    paneKey: string | null
    processIncarnation: string | null
  }
): Promise<{ wait: RuntimeTerminalWait; handle: string }> {
  const startedAt = Date.now()
  try {
    return { wait: await waitForWorkerAgentReady(runtime, handle, args), handle }
  } catch (error) {
    const reminted =
      error instanceof Error && error.message === 'terminal_handle_stale' && args.paneKey
        ? runtime.getTerminalHandleForPaneKey(args.paneKey)
        : null
    if (
      !reminted ||
      reminted === handle ||
      args.processIncarnation === null ||
      runtime.getTerminalProcessIncarnation(reminted) !== args.processIncarnation
    ) {
      throw error
    }
    const timeoutMs = Math.max(1, args.timeoutMs - (Date.now() - startedAt))
    return {
      wait: await waitForWorkerAgentReady(runtime, reminted, { ...args, timeoutMs }),
      handle: reminted
    }
  }
}
