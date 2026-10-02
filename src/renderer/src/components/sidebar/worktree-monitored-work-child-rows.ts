import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import type { AgentRowState } from '@/lib/agent-row-decay-state'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { buildSubagentChildRows, derivedChildRowKey } from './worktree-subagent-child-rows'

/**
 * One display-only row per shell, monitor or cron holding the parent in `monitoring`. Shown only
 * while the parent row is working: the list says what is running, never whether the row is live.
 */
function buildMonitoredWorkChildRows(args: {
  parentEntry: AgentStatusEntry
  parentState: AgentRowState
  tab: TerminalTab
}): DashboardAgentRow[] {
  const work = args.parentEntry.monitoredWork
  if (!work || work.length === 0 || args.parentState !== 'working') {
    return []
  }
  return work.map((item) => {
    const paneKey = derivedChildRowKey(args.parentEntry.paneKey, `monitored:${item.id}`)
    const label = item.label ?? item.detail ?? item.id
    const entry: AgentStatusEntry = {
      state: 'working',
      workingMode: 'monitoring',
      prompt: label,
      updatedAt: args.parentEntry.updatedAt,
      stateStartedAt: item.firstObservedAt,
      paneKey,
      worktreeId: args.parentEntry.worktreeId,
      tabId: args.parentEntry.tabId,
      stateHistory: [],
      orchestration: {
        taskId: `monitored:${item.id}`,
        dispatchId: `monitored:${item.id}`,
        displayName: label,
        parentPaneKey: args.parentEntry.paneKey
      }
    }
    return {
      paneKey,
      entry,
      tab: args.tab,
      agentType: 'unknown',
      rowSource: 'monitored-work' as const,
      state: 'working' as const,
      activationPaneKey: args.parentEntry.paneKey,
      ...(item.detail !== undefined ? { detail: item.detail } : {}),
      startedAt: item.firstObservedAt
    }
  })
}

/** Every child row derived from a parent's status entry: subagents first, then monitored work. */
export function buildDerivedChildRows(args: {
  parentEntry: AgentStatusEntry
  parentState: AgentRowState
  tab: TerminalTab
  parentIsFresh: boolean
}): DashboardAgentRow[] {
  return [...buildSubagentChildRows(args), ...buildMonitoredWorkChildRows(args)]
}
