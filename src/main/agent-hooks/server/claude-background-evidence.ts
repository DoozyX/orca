import type { HookListenerState } from '../../../shared/agent-hook-listener/listener-state'
import type { ClaudeMonitoredWork } from '../../../shared/agent-hook-listener/providers/claude-monitored-work'

export type ClaudeBackgroundEvidence = {
  runningTasks: readonly string[] | undefined
  hasActiveCron: boolean
  monitoredWork: ClaudeMonitoredWork | undefined
}

export function readClaudeBackgroundEvidence(
  state: HookListenerState,
  paneKey: string
): ClaudeBackgroundEvidence {
  return {
    runningTasks: state.claudeRunningNonAgentTasksByPaneKey.get(paneKey),
    hasActiveCron: state.claudeActiveSessionCronPaneKeys.has(paneKey),
    monitoredWork: state.claudeMonitoredWorkByPaneKey.get(paneKey)
  }
}

export function writeClaudeBackgroundEvidence(
  state: HookListenerState,
  paneKey: string,
  evidence: ClaudeBackgroundEvidence
): void {
  const { runningTasks, hasActiveCron, monitoredWork } = evidence
  if (runningTasks) {
    state.claudeRunningNonAgentTasksByPaneKey.set(paneKey, runningTasks)
  } else {
    state.claudeRunningNonAgentTasksByPaneKey.delete(paneKey)
  }
  if (hasActiveCron) {
    state.claudeActiveSessionCronPaneKeys.add(paneKey)
  } else {
    state.claudeActiveSessionCronPaneKeys.delete(paneKey)
  }
  if (monitoredWork) {
    state.claudeMonitoredWorkByPaneKey.set(paneKey, monitoredWork)
  } else {
    state.claudeMonitoredWorkByPaneKey.delete(paneKey)
  }
}

export function clearClaudeBackgroundEvidence(state: HookListenerState, paneKey: string): void {
  state.claudeRunningNonAgentTasksByPaneKey.delete(paneKey)
  state.claudeActiveSessionCronPaneKeys.delete(paneKey)
  state.claudeMonitoredWorkByPaneKey.delete(paneKey)
}
