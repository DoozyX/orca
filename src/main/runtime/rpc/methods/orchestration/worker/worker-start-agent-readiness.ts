import type { RuntimeTerminalWait } from '../../../../../../shared/runtime-terminal-contracts'
import type { TuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent'
import type { TerminalReadinessCreation } from '../../../../terminal/wait/launched-agent-composer-readiness'
import { waitForWorkerAgentReadyRebinding } from '../../../../terminal/wait/worker-agent-readiness-rebind'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { OrchestrationDb } from '../../../../orchestration/db/orchestration-db'

/**
 * A terminal worker's agent-readiness wait. When a graph reload remints the pane's handle during
 * it, the start follows the same process: `stage` and its creation custody row take the new handle (#29).
 */
export async function waitForWorkerStartAgentReady(
  runtime: OrcaRuntimeService,
  stage: { db: OrchestrationDb; dispatchId: string; terminalHandle: string },
  args: {
    agent: TuiAgent | undefined
    reusesTerminal: boolean
    timeoutMs: number
    creation?: TerminalReadinessCreation
  }
): Promise<RuntimeTerminalWait> {
  const fromHandle = stage.terminalHandle
  const processIncarnation = runtime.getTerminalProcessIncarnation(fromHandle)
  const ready = await waitForWorkerAgentReadyRebinding(runtime, fromHandle, {
    ...args,
    paneKey: runtime.getTerminalPaneKey(fromHandle),
    processIncarnation
  })
  // The wait rebinds only a known incarnation, so a new handle always comes with one.
  if (ready.handle !== fromHandle && processIncarnation !== null) {
    stage.db.rebindWorkerTerminalResourceHandle({
      dispatchId: stage.dispatchId,
      fromHandle,
      toHandle: ready.handle,
      processIncarnation
    })
    stage.terminalHandle = ready.handle
  }
  return ready.wait
}
