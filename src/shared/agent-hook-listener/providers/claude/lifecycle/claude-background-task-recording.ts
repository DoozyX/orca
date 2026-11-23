import type { HookListenerState } from '../../../listener-state'
import type { ClaudeMonitoredWorkObservation } from '../background-tasks/claude-background-task-inventory'
import { replaceClaudeMonitoredTasks } from '../../claude-monitored-work'
import { updateClaudeRunningNonAgentTask } from './claude-roster-state'

/** A present `background_tasks` inventory sets both the running-shell flag and the listed shells. */
export function recordClaudeBackgroundTasks(
  state: HookListenerState,
  paneKey: string,
  tasks: {
    hasRunningNonAgentTask: boolean
    runningNonAgentTaskCommands: readonly string[]
    monitoredWork: readonly ClaudeMonitoredWorkObservation[]
  }
): void {
  updateClaudeRunningNonAgentTask(state, paneKey, tasks)
  replaceClaudeMonitoredTasks(state, paneKey, tasks.monitoredWork)
}
