import type { HookListenerState } from '../../../shared/agent-hook-listener/listener-state'
import type { ClaudeMonitoredWork } from '../../../shared/agent-hook-listener/providers/claude-monitored-work'

export type ClaudeBackgroundEvidence = {
  hasRunningTask: boolean
  hasActiveCron: boolean
  monitoredWork: ClaudeMonitoredWork | undefined
}

export function readClaudeBackgroundEvidence(
  state: HookListenerState,
  paneKey: string
): ClaudeBackgroundEvidence {
  return {
    hasRunningTask: state.claudeRunningNonAgentTaskPaneKeys.has(paneKey),
    hasActiveCron: state.claudeActiveSessionCronPaneKeys.has(paneKey),
    monitoredWork: state.claudeMonitoredWorkByPaneKey.get(paneKey)
  }
}

export function writeClaudeBackgroundEvidence(
  state: HookListenerState,
  paneKey: string,
  evidence: ClaudeBackgroundEvidence
): void {
  const { hasRunningTask, hasActiveCron, monitoredWork } = evidence
  if (hasRunningTask) {
    state.claudeRunningNonAgentTaskPaneKeys.add(paneKey)
  } else {
    state.claudeRunningNonAgentTaskPaneKeys.delete(paneKey)
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
