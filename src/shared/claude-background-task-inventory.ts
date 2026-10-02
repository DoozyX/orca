import { AGENT_STATUS_MAX_SUBAGENTS } from './agent-status-types'
import { classifyClaudeBackgroundTaskKind } from './claude-background-task-kind'
import { isAgentChildWorkKind } from './agent-status-child-work-liveness'
import type { AgentMonitoredWorkSnapshot } from './agent-monitored-work'

const CLAUDE_TERMINAL_BACKGROUND_TASK_STATUSES = new Set([
  'idle',
  'done',
  'success',
  'succeeded',
  'complete',
  'completed',
  'finished',
  'failed',
  'error',
  'terminated',
  'exited',
  'aborted',
  'expired',
  'skipped',
  'crashed',
  'killed',
  'cancelled',
  'canceled',
  'timed_out'
])

/** One agent entry from the `background_tasks` array Claude attaches to Stop
 *  (and SubagentStop) hook payloads. Non-agent tasks do not become rows. */
export type ClaudeBackgroundAgentTask = {
  id: string
  agentType?: string
  description?: string
  running: boolean
  /** True for `type: "teammate"` entries. Their ids never match lifecycle
   *  agent_ids and they report "running" permanently — even after the named
   *  agent finished — so they carry no per-agent state at all. */
  teammate: boolean
}

/** A live non-agent entry as the inventory reports it; the listener dates it. */
export type ClaudeMonitoredWorkObservation = Omit<AgentMonitoredWorkSnapshot, 'firstObservedAt'>

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function monitoredWorkObservation(
  obj: Record<string, unknown>,
  kind: ClaudeMonitoredWorkObservation['kind']
): ClaudeMonitoredWorkObservation | null {
  if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
    return null
  }
  const label = optionalText(obj.description)
  const detail = optionalText(obj.command)
  return {
    id: obj.id.trim(),
    kind,
    ...(label !== undefined ? { label } : {}),
    ...(detail !== undefined ? { detail } : {})
  }
}

/** Read the agent-typed entries of a hook payload's `background_tasks` field.
 *  `present: false` means the field was absent/malformed (older Claude builds),
 *  so callers must keep their tracked roster instead of clearing it. */
export function readClaudeBackgroundAgentTasks(hookPayload: Record<string, unknown>): {
  present: boolean
  tasks: ClaudeBackgroundAgentTask[]
  truncated: boolean
  hasRunningNonAgentTask: boolean
  /** Live non-agent entries, in inventory order. */
  monitoredWork: ClaudeMonitoredWorkObservation[]
} {
  const raw = hookPayload['background_tasks']
  if (!Array.isArray(raw)) {
    return {
      present: false,
      tasks: [],
      truncated: false,
      hasRunningNonAgentTask: false,
      monitoredWork: []
    }
  }
  const tasks: ClaudeBackgroundAgentTask[] = []
  const monitoredWork: ClaudeMonitoredWorkObservation[] = []
  let truncated = false
  let hasRunningNonAgentTask = false
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      truncated = true
      hasRunningNonAgentTask = true
      continue
    }
    const obj = item as Record<string, unknown>
    const taskType = typeof obj.type === 'string' ? obj.type.trim().toLowerCase() : ''
    const taskStatus = typeof obj.status === 'string' ? obj.status.trim().toLowerCase() : ''
    const isTerminal =
      taskStatus.length > 0 && CLAUDE_TERMINAL_BACKGROUND_TASK_STATUSES.has(taskStatus)
    const kind = classifyClaudeBackgroundTaskKind(taskType)
    if (taskType.length === 0) {
      truncated = true
      hasRunningNonAgentTask ||= !isTerminal
    }
    const isAgentTask = taskType.length > 0 && isAgentChildWorkKind(kind)
    // Why: future non-agent types and nonterminal labels must fail active; only typed agent rows or explicit terminal states can safely retire work.
    if (!isAgentTask && !isTerminal) {
      hasRunningNonAgentTask = true
      const observation = monitoredWorkObservation(obj, kind === 'agent' ? 'unknown' : kind)
      if (observation) {
        monitoredWork.push(observation)
      }
    }
    if (!isAgentTask) {
      continue
    }
    if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
      truncated = true
      continue
    }
    if (tasks.length >= AGENT_STATUS_MAX_SUBAGENTS) {
      // Why: a capped inventory cannot prove a tracked id is absent; callers
      // must retain unlisted rows rather than deleting live overflow tasks.
      truncated = true
      continue
    }
    tasks.push({
      id: obj.id.trim(),
      agentType: typeof obj.agent_type === 'string' ? obj.agent_type : undefined,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      running: !isTerminal,
      teammate: taskType === 'teammate'
    })
  }
  return { present: true, tasks, truncated, hasRunningNonAgentTask, monitoredWork }
}

/** Read `session_crons`. `present: false` means the field was absent, so callers keep what they have. */
export function readClaudeSessionCrons(hookPayload: Record<string, unknown>): {
  present: boolean
  crons: ClaudeMonitoredWorkObservation[]
} {
  const raw = hookPayload['session_crons']
  if (!Array.isArray(raw)) {
    return { present: false, crons: [] }
  }
  const crons: ClaudeMonitoredWorkObservation[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue
    }
    const obj = item as Record<string, unknown>
    if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
      continue
    }
    const label = optionalText(obj.prompt)
    const schedule = optionalText(obj.schedule)
    crons.push({
      id: obj.id.trim(),
      kind: 'cron',
      ...(label !== undefined ? { label } : {}),
      ...(schedule !== undefined
        ? { detail: `${schedule} · ${obj.recurring === false ? 'once' : 'recurring'}` }
        : {})
    })
  }
  return { present: true, crons }
}
