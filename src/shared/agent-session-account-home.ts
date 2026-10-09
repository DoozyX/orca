/** Durable account binding: existing single-directory records or OpenCode's data context. */

import type { AgentSessionStoredAgent } from './agent-session-stored-agent'
import {
  MAX_ID_LENGTH,
  MAX_PATH_LENGTH,
  isBoundedString
} from './agent-session-record-field-limits'

export { MAX_PATH_LENGTH }

/** Account root pinned at launch by the account selector, so a resume cannot drift to another login. */
export type LegacyAgentSessionAccountHome = {
  /** Environment variable naming the agent's config directory. */
  variable: string
  /** Host-resolved absolute path in the execution host's own path syntax. */
  path: string
  /** Present when a project-group binding chose this home. Host-set; a client may never supply it. */
  binding?: { kind: 'project-group'; groupId: string }
}

export type OpenCodeAccountLocator =
  | { kind: 'managed'; managedProfileId: string }
  // The user's own environment, read at every launch.
  | { kind: 'unmanaged' }

export type OpenCodeAgentSessionAccountHome = {
  kind: 'opencode'
  locator: OpenCodeAccountLocator
}

export type AgentSessionAccountHome =
  | LegacyAgentSessionAccountHome
  | OpenCodeAgentSessionAccountHome

export function isLegacyAgentSessionAccountHome(
  home: AgentSessionAccountHome
): home is LegacyAgentSessionAccountHome {
  return !('kind' in home)
}

export function requireLegacyAgentSessionAccountHome(
  home: AgentSessionAccountHome
): LegacyAgentSessionAccountHome {
  if (!isLegacyAgentSessionAccountHome(home)) {
    throw new Error('Expected a single-directory agent account binding.')
  }
  return home
}

export function agentSessionAccountHomesEqual(
  left: AgentSessionAccountHome,
  right: AgentSessionAccountHome
): boolean {
  if (isLegacyAgentSessionAccountHome(left)) {
    return (
      isLegacyAgentSessionAccountHome(right) &&
      left.variable === right.variable &&
      left.path === right.path &&
      left.binding?.kind === right.binding?.kind &&
      left.binding?.groupId === right.binding?.groupId
    )
  }
  if (isLegacyAgentSessionAccountHome(right)) {
    return false
  }
  if (left.locator.kind === 'managed') {
    return (
      right.locator.kind === 'managed' &&
      left.locator.managedProfileId === right.locator.managedProfileId
    )
  }
  return right.locator.kind === 'unmanaged'
}

/** The account home of `agent` at `path`. */
export function agentSessionAccountHome(
  agent: { accountHomeVariable: string },
  path: string
): LegacyAgentSessionAccountHome {
  return { variable: agent.accountHomeVariable, path }
}

/** Whether `home` is the kind of account `agent` pins: its own directory variable, or its locator
 *  kind. It becomes the child's environment, so a record pinning another agent's kind never starts. */
export function agentPinsAccountHome(
  agent: AgentSessionStoredAgent,
  home: AgentSessionAccountHome
): boolean {
  return isLegacyAgentSessionAccountHome(home)
    ? agent.accountHomeVariable !== undefined && home.variable === agent.accountHomeVariable
    : agent.accountLocatorKind === home.kind
}

function isBoundedAccountString(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !value.includes('\u0000')
  )
}

function isAccountHomeBinding(value: unknown): value is LegacyAgentSessionAccountHome['binding'] {
  if (value === undefined) {
    return true
  }
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return (
    'kind' in value &&
    value.kind === 'project-group' &&
    'groupId' in value &&
    isBoundedString(value.groupId, MAX_ID_LENGTH)
  )
}

const ENVIRONMENT_VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Shape only: whether the variable is the one the record's agent pins is a launch-time question
 *  (`agentDrivesSession`), so an agent that renames its variable never hides its chats. Fields a
 *  newer build adds are ignored, so its records stay readable here. */
export function isAgentSessionAccountHome(value: unknown): value is AgentSessionAccountHome {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  if (!('kind' in value)) {
    return (
      'variable' in value &&
      typeof value.variable === 'string' &&
      ENVIRONMENT_VARIABLE_NAME.test(value.variable) &&
      'path' in value &&
      isBoundedAccountString(value.path, MAX_PATH_LENGTH) &&
      isAccountHomeBinding('binding' in value ? value.binding : undefined)
    )
  }
  if (
    value.kind !== 'opencode' ||
    !('locator' in value) ||
    typeof value.locator !== 'object' ||
    value.locator === null ||
    Array.isArray(value.locator) ||
    !('kind' in value.locator)
  ) {
    return false
  }
  const locator = value.locator
  if (locator.kind === 'managed') {
    return (
      'managedProfileId' in locator &&
      typeof locator.managedProfileId === 'string' &&
      PROFILE_ID.test(locator.managedProfileId)
    )
  }
  return locator.kind === 'unmanaged'
}
