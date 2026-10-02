import {
  AGENT_STATUS_MAX_MONITORED_WORK,
  type AgentMonitoredWorkSnapshot
} from '../../agent-monitored-work'
import type { ClaudeMonitoredWorkObservation } from '../../claude-background-task-inventory'
import type { HookListenerState } from '../listener-state'

/** Shells and crons arrive in separate inventories and retire separately (a session-owner change
 *  voids crons only), so each half is replaced on its own. */
export type ClaudeMonitoredWork = {
  tasks: readonly AgentMonitoredWorkSnapshot[]
  crons: readonly AgentMonitoredWorkSnapshot[]
}

function dated(
  observed: readonly ClaudeMonitoredWorkObservation[],
  previous: readonly AgentMonitoredWorkSnapshot[],
  now: number
): AgentMonitoredWorkSnapshot[] {
  const firstObservedAtById = new Map(previous.map((item) => [item.id, item.firstObservedAt]))
  return observed.map((item) => ({
    ...item,
    firstObservedAt: firstObservedAtById.get(item.id) ?? now
  }))
}

function setMonitoredWork(
  state: HookListenerState,
  paneKey: string,
  next: ClaudeMonitoredWork
): void {
  if (next.tasks.length === 0 && next.crons.length === 0) {
    state.claudeMonitoredWorkByPaneKey.delete(paneKey)
  } else {
    state.claudeMonitoredWorkByPaneKey.set(paneKey, next)
  }
}

/** Replace the shell half from a present `background_tasks` inventory, the same evidence that
 *  drives `claudeRunningNonAgentTaskPaneKeys`. */
export function replaceClaudeMonitoredTasks(
  state: HookListenerState,
  paneKey: string,
  observed: readonly ClaudeMonitoredWorkObservation[],
  now = Date.now()
): void {
  const current = state.claudeMonitoredWorkByPaneKey.get(paneKey)
  setMonitoredWork(state, paneKey, {
    tasks: dated(observed, current?.tasks ?? [], now),
    crons: current?.crons ?? []
  })
}

/** Replace the cron half from a present `session_crons` inventory; an empty list clears it. */
export function replaceClaudeMonitoredCrons(
  state: HookListenerState,
  paneKey: string,
  observed: readonly ClaudeMonitoredWorkObservation[],
  now = Date.now()
): void {
  const current = state.claudeMonitoredWorkByPaneKey.get(paneKey)
  setMonitoredWork(state, paneKey, {
    tasks: current?.tasks ?? [],
    crons: dated(observed, current?.crons ?? [], now)
  })
}

export function claudeMonitoredWorkForPayload(
  state: HookListenerState,
  paneKey: string
): AgentMonitoredWorkSnapshot[] | undefined {
  const work = state.claudeMonitoredWorkByPaneKey.get(paneKey)
  if (!work) {
    return undefined
  }
  return [...work.tasks, ...work.crons].slice(0, AGENT_STATUS_MAX_MONITORED_WORK)
}
