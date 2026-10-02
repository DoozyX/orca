import { normalizeOptionalField } from './agent-status-field-normalization'

/** Non-agent child work only; agent children stay in `subagents`. */
export type AgentMonitoredWorkKind = 'command' | 'monitor' | 'workflow' | 'cron' | 'unknown'

/** One item of a row's `monitoredWork`: display-only description of the shells, monitors and
 *  crons that hold a row in `monitoring`. Liveness stays with the producer's own fact (Claude's
 *  `claudeRunningNonAgentTask`); no reader derives state from this list. */
export type AgentMonitoredWorkSnapshot = {
  /** Provider task or cron id. */
  id: string
  kind: AgentMonitoredWorkKind
  /** Shell description, cron prompt, or native task description. */
  label?: string
  /** Shell command or cron schedule; shown on hover. */
  detail?: string
  /** Host epoch ms when first observed; the hook inventory carries no start time. */
  firstObservedAt: number
}

export const AGENT_STATUS_MAX_MONITORED_WORK = 32
const MONITORED_WORK_ID_MAX_LENGTH = 64
// Same bound as the toolInput preview, which is also a one-line command.
const MONITORED_WORK_TEXT_MAX_LENGTH = 160

function normalizeMonitoredWorkKind(value: unknown): AgentMonitoredWorkKind {
  switch (value) {
    case 'command':
    case 'monitor':
    case 'workflow':
    case 'cron':
      return value
    default:
      // Rule 4: a kind a newer host adds degrades to unknown instead of dropping the item.
      return 'unknown'
  }
}

function normalizeMonitoredWorkItem(value: unknown): AgentMonitoredWorkSnapshot | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const obj = value as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id.trim() : ''
  if (id.length === 0 || id.length > MONITORED_WORK_ID_MAX_LENGTH) {
    return null
  }
  if (
    typeof obj.firstObservedAt !== 'number' ||
    !Number.isFinite(obj.firstObservedAt) ||
    obj.firstObservedAt < 0
  ) {
    return null
  }
  const label = normalizeOptionalField(obj.label, MONITORED_WORK_TEXT_MAX_LENGTH)
  const detail = normalizeOptionalField(obj.detail, MONITORED_WORK_TEXT_MAX_LENGTH)
  return {
    id,
    kind: normalizeMonitoredWorkKind(obj.kind),
    ...(label !== undefined ? { label } : {}),
    ...(detail !== undefined ? { detail } : {}),
    firstObservedAt: obj.firstObservedAt
  }
}

/** A malformed field or item drops itself, never the row. */
export function normalizeMonitoredWorkField(
  value: unknown
): AgentMonitoredWorkSnapshot[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const normalized: AgentMonitoredWorkSnapshot[] = []
  for (const item of value) {
    const snapshot = normalizeMonitoredWorkItem(item)
    if (snapshot) {
      normalized.push(snapshot)
      if (normalized.length >= AGENT_STATUS_MAX_MONITORED_WORK) {
        break
      }
    }
  }
  return normalized.length > 0 ? normalized : undefined
}

/** Structural equality so stores can keep the previous reference when nothing changed. */
export function agentMonitoredWorkEqual(
  a: readonly AgentMonitoredWorkSnapshot[] | undefined,
  b: readonly AgentMonitoredWorkSnapshot[] | undefined
): boolean {
  if (a === b) {
    return true
  }
  if (!a || !b || a.length !== b.length) {
    return !a && !b
  }
  return a.every((x, i) => {
    const y = b[i]
    return (
      x.id === y.id &&
      x.kind === y.kind &&
      x.label === y.label &&
      x.detail === y.detail &&
      x.firstObservedAt === y.firstObservedAt
    )
  })
}
