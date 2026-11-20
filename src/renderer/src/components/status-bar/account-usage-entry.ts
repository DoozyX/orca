import type {
  ProviderRateLimits,
  RateLimitRuntimeTarget
} from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { ClaudeAccountAssignmentSource } from '../../../../shared/claude-account-assignment'

export type AccountUsageEntry = {
  key: string
  provider: ProviderRateLimits['provider']
  accountId: string | null
  label: string | null
  runtimeTarget: RateLimitRuntimeTarget | null
  selected: boolean
  /** The group or project that pins this account for the focused workspace. */
  assignedBy: ClaudeAccountAssignmentSource | null
  limits: ProviderRateLimits | null
  isFetching: boolean
  updatedAt: number
}

export function providerUsageEntry(limits: ProviderRateLimits): AccountUsageEntry {
  return {
    key: limits.provider,
    provider: limits.provider,
    accountId: null,
    label: null,
    runtimeTarget: null,
    selected: true,
    assignedBy: null,
    limits,
    isFetching: limits.status === 'fetching',
    updatedAt: limits.updatedAt
  }
}

export function entryRateLimits(entry: AccountUsageEntry): ProviderRateLimits {
  return (
    entry.limits ?? {
      provider: entry.provider,
      session: null,
      weekly: null,
      updatedAt: 0,
      error: null,
      status: entry.isFetching ? 'fetching' : 'unavailable'
    }
  )
}
