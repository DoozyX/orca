import type {
  ProviderRateLimits,
  RateLimitRuntimeTarget
} from '../../../../shared/rate-limit-types'
import type { StatusBarUsageMode } from '../../../../shared/status-bar-usage-mode'
import { usageChipShowsPercentage, type UsageUnitLabelState } from './usage-unit-label'

export type AccountUsageEntry = {
  key: string
  provider: ProviderRateLimits['provider']
  accountId: string | null
  label: string | null
  runtimeTarget: RateLimitRuntimeTarget | null
  selected: boolean
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

/** The unit label's state over account chips, whose collapse keys are entry keys, not providers. */
export function getEntryUsageUnitLabelState(
  entries: readonly AccountUsageEntry[],
  collapsedKeys: readonly string[],
  mode: StatusBarUsageMode
): UsageUnitLabelState {
  const withPercentage = entries.filter((entry) =>
    usageChipShowsPercentage(entryRateLimits(entry), mode)
  )
  if (withPercentage.length === 0) {
    return 'absent'
  }
  return withPercentage.every((entry) => collapsedKeys.includes(entry.key)) ? 'collapsed' : 'shown'
}
