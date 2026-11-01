import type { AgentSessionLaunchArgs } from './agent-session-record'
import { MAX_LAUNCH_ARGS, MAX_LAUNCH_ARGS_BYTES } from './agent-session-record-field-limits'

/** Arguments pinned on a record's first reservation, bounded before they are persisted. */
export function isAgentSessionLaunchArgs(value: unknown): value is AgentSessionLaunchArgs {
  return (
    Array.isArray(value) &&
    value.length <= MAX_LAUNCH_ARGS &&
    value.every((arg) => typeof arg === 'string' && !arg.includes('\0')) &&
    Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_LAUNCH_ARGS_BYTES
  )
}
