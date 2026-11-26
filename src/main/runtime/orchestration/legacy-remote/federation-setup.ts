import type { OrcaRuntimeService } from '../../orca-runtime'
import type { OrchestrationDb } from '../db/orchestration-db'
import {
  applyWaitForSetupOutcome,
  type WorkerSetupReceipt
} from '../../rpc/methods/orchestration/worker/start/placement/worker-placement-topology'
import { isFederationResidualEffect, type FederationEffect } from './federation-effects'
import { waitForWorkerAgentReadyRebinding } from '../../terminal/wait/worker-agent-readiness-rebind'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { RuntimeTerminalWait } from '../../../../shared/terminal/runtime/runtime-terminal-contracts'

type FederationSetupStageArgs = {
  db: OrchestrationDb
  dispatchId: string
  worktreeId: string
  terminalHandle: string
  setup: WorkerSetupReceipt
  effects: FederationEffect[]
}

function recordStage(args: FederationSetupStageArgs, stage: string): void {
  args.db.recordRemoteAttachmentStage({
    dispatchId: args.dispatchId,
    stage,
    worktreeId: args.worktreeId,
    terminalHandle: args.terminalHandle,
    setupState: args.setup.state,
    effects: args.effects,
    residualResources: args.effects.filter(isFederationResidualEffect)
  })
}

export function persistFederatedReadinessStage(args: FederationSetupStageArgs): void {
  recordStage(args, 'terminal_readying')
}

export function persistFederatedSetupSpawnFailure(args: FederationSetupStageArgs): boolean {
  if (args.setup.startupPolicy !== 'wait-for-setup' || args.setup.state !== 'spawn_failed') {
    return false
  }
  recordStage(args, 'setup_start')
  return true
}

export function persistFederatedSetupWaitOutcome(
  args: FederationSetupStageArgs & { wait: { satisfied: boolean; status: string } }
): void {
  applyWaitForSetupOutcome(args.setup, args.effects, args.wait)
  if (args.setup.startupPolicy === 'wait-for-setup') {
    recordStage(args, args.setup.state === 'failed' ? 'setup_failed' : 'setup_settled')
  }
}

/** The agent-readiness wait and its outcome; a graph reload can remint the pane's handle during it, so the stage follows the same process (#29). */
export async function waitForFederatedAgentReady(
  runtime: OrcaRuntimeService,
  stage: FederationSetupStageArgs,
  agent: TuiAgent | undefined,
  args: Omit<
    Parameters<typeof waitForWorkerAgentReadyRebinding>[2],
    'agent' | 'paneKey' | 'processIncarnation'
  >
): Promise<RuntimeTerminalWait> {
  const handle = stage.terminalHandle
  const ready = await waitForWorkerAgentReadyRebinding(runtime, handle, {
    ...args,
    agent,
    paneKey: runtime.getTerminalPaneKey(handle),
    processIncarnation: runtime.getTerminalProcessIncarnation(handle)
  })
  stage.terminalHandle = ready.handle
  persistFederatedSetupWaitOutcome({ ...stage, wait: ready.wait })
  return ready.wait
}

export function monitorFederatedSetup(
  args: FederationSetupStageArgs & { runtime: OrcaRuntimeService }
): void {
  const setupTerminal = args.effects.find(
    (effect) => effect.kind === 'terminal' && effect.role === 'setup' && effect.id
  )
  if (
    !setupTerminal?.id ||
    args.setup.startupPolicy !== 'start-immediately' ||
    args.setup.state !== 'running'
  ) {
    return
  }
  void args.runtime
    .waitForSetupTerminalCompletion(setupTerminal.id)
    .then((completion) => {
      const setupState = completion.exitCode === 0 ? 'succeeded' : 'failed'
      const effects = args.effects.map((effect) =>
        effect.kind === 'setup' ? { ...effect, state: setupState } : effect
      )
      const evidence = args.db.updateRemoteAttachmentSetupEvidence({
        dispatchId: args.dispatchId,
        setupState,
        effects
      })
      if (!evidence.changed) {
        return
      }
      args.db.enqueueFederationRelay({
        dispatchId: args.dispatchId,
        direction: 'to_home',
        kind: 'status',
        payload: JSON.stringify({
          from: `dispatch:${args.dispatchId}`,
          subject: `Setup ${setupState} for worker ${args.dispatchId}`,
          body: '',
          type: 'status',
          priority: setupState === 'failed' ? 'high' : 'normal',
          threadId: null,
          payload: JSON.stringify({
            dispatchId: args.dispatchId,
            setupState,
            terminalHandle: setupTerminal.id
          })
        })
      })
    })
    .catch(() => undefined)
}
