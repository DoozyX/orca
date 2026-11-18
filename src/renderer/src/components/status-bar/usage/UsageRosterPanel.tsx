import React from 'react'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { SettingsSegmentedControl } from '@/components/settings/form-controls/SettingsFormControls'
import { useResetCountdownClock } from '@/components/status-bar/usage/useResetCountdownClock'
import { useTranslate } from '@/i18n/use-translate'
import type { ProviderRateLimits } from '../../../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { UsagePercentageDisplay } from '../../../../../shared/agent-usage/display/usage-percentage-display'
import { getUsageRosterRowState } from './usage-roster-row-state'
import type { StatusBarUsageMode } from '../../../../../shared/status-bar/status-bar-usage-mode'
import { providerPrimaryMaxUsed, usedSections } from './usage-headline-sections'
import { UsageDisplayToggle } from './usage-meter'
import { UsageRow } from './UsageRosterRow'
import { entryRateLimits, providerUsageEntry, type AccountUsageEntry } from '../account-usage-entry'

type ProviderId = ProviderRateLimits['provider']
const EMPTY_PROVIDERS: ProviderRateLimits[] = []

// Worst-first so the agent nearest a limit sits on top; a stable sort keeps each provider's accounts together.
function sortEntriesByProviderUsage(
  entries: AccountUsageEntry[],
  t: ReturnType<typeof useTranslate>
): AccountUsageEntry[] {
  const providerMaxUsed = new Map<ProviderId, number>()
  for (const entry of entries) {
    const used = Math.max(
      providerMaxUsed.get(entry.provider) ?? -1,
      providerPrimaryMaxUsed(entryRateLimits(entry), t)
    )
    providerMaxUsed.set(entry.provider, used)
  }
  return [...entries].sort(
    (a, b) => (providerMaxUsed.get(b.provider) ?? -1) - (providerMaxUsed.get(a.provider) ?? -1)
  )
}

/** Shared account roster; hosts can wrap rows with account controls or detail menus. */
export function UsageRosterPanel({
  providers = EMPTY_PROVIDERS,
  entries: entriesProp,
  display,
  statusBarUsageMode,
  onStatusBarUsageModeChange,
  isRefreshing,
  onRefresh,
  onOpenProvider,
  onSignIn,
  canSignIn,
  onManageAccounts,
  onUsageDetails,
  renderRow
}: {
  providers?: ProviderRateLimits[]
  entries?: AccountUsageEntry[]
  display: UsagePercentageDisplay
  statusBarUsageMode: StatusBarUsageMode
  onStatusBarUsageModeChange: (mode: StatusBarUsageMode) => void
  isRefreshing: boolean
  onRefresh: () => void
  onOpenProvider: (provider: ProviderId) => void
  onSignIn: (provider: ProviderId) => void
  canSignIn: (provider: ProviderId) => boolean
  onManageAccounts: () => void
  onUsageDetails: () => void
  // Return null to use the default row instead of a host-supplied detail/account wrapper.
  renderRow?: (
    p: ProviderRateLimits,
    row: React.ReactNode,
    entry: AccountUsageEntry
  ) => React.ReactNode
}): React.JSX.Element {
  const t = useTranslate()
  const entries = entriesProp ?? providers.map(providerUsageEntry)
  // Why: one boundary-scheduled clock keeps every open row current without per-provider timers.
  const now = useResetCountdownClock(
    entries.flatMap((entry) =>
      usedSections(entryRateLimits(entry), t).map((section) => section.window.resetsAt)
    )
  )
  // Why primary-only: a spent Fable/MCP window must not push a healthy provider to the top.
  const sorted = sortEntriesByProviderUsage(entries, t)

  return (
    <div className="@container w-full text-xs">
      <div className="flex items-center justify-between gap-2 pb-2 pl-3.5 pr-[30px] pt-3">
        <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <span className="text-[13px] font-semibold text-foreground">
            {t('auto.components.status.bar.UsageRosterPanel.title', 'Usage')}
          </span>
          <span className="truncate text-[11px]">
            · {t('auto.components.status.bar.UsageRosterPanel.allAgents', 'all agents')}
          </span>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              onRefresh()
            }}
            aria-label={t('auto.components.status.bar.StatusBar.3325d996cb', 'Refresh rate limits')}
            className="size-5 justify-center p-0"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          </DropdownMenuItem>
        </div>
        <UsageDisplayToggle asMenuItem />
      </div>
      {/* Keep the density picker in the popover so both usage modes are discoverable. */}
      <div className="px-3.5 pb-2.5">
        <SettingsSegmentedControl<StatusBarUsageMode>
          value={statusBarUsageMode}
          onChange={onStatusBarUsageModeChange}
          ariaLabel={t(
            'auto.components.status.bar.UsageRosterPanel.footerDetailAria',
            'Usage footer detail'
          )}
          size="sm"
          equalWidth
          options={[
            {
              value: 'verbose',
              label: t('auto.components.status.bar.UsageRosterPanel.detailed', 'Detailed'),
              tooltip: t(
                'auto.components.status.bar.UsageRosterPanel.detailedTooltip',
                'Full usage with bars, labels, and percentages'
              )
            },
            {
              value: 'compact',
              label: t('auto.components.status.bar.UsageRosterPanel.compact', 'Compact'),
              tooltip: t(
                'auto.components.status.bar.UsageRosterPanel.compactTooltip',
                'Condensed usage: one summary per provider'
              )
            }
          ]}
        />
      </div>
      <div className="border-t border-border/70" />
      <div className="max-h-[360px] overflow-y-auto scrollbar-sleek">
        {sorted.map((entry) => {
          const p = entryRateLimits(entry)
          const state = getUsageRosterRowState(p, usedSections(p, t).length > 0, t)
          const showSignInAction = state.kind === 'sign-in' && canSignIn(p.provider)
          const rowNode = (
            <UsageRow
              p={p}
              accountLabel={entry.label}
              selected={entry.selected && entry.label !== null}
              display={display}
              state={state}
              showSignInAction={showSignInAction}
              now={now}
              mode={statusBarUsageMode}
            />
          )
          if (showSignInAction) {
            return (
              <DropdownMenuItem
                key={entry.key}
                onSelect={() => onSignIn(p.provider)}
                className="w-full cursor-pointer rounded-none px-3.5 py-2.5"
              >
                {rowNode}
              </DropdownMenuItem>
            )
          }
          const custom = renderRow?.(p, rowNode, entry)
          if (custom) {
            return <React.Fragment key={entry.key}>{custom}</React.Fragment>
          }
          return (
            <DropdownMenuItem
              key={entry.key}
              onSelect={() => onOpenProvider(p.provider)}
              className="w-full cursor-pointer rounded-none px-3.5 py-2.5"
            >
              {rowNode}
            </DropdownMenuItem>
          )
        })}
      </div>
      <div className="border-t border-border/70" />
      <DropdownMenuItem
        onSelect={onUsageDetails}
        className="w-full cursor-pointer justify-between rounded-none px-3.5 py-2.5 text-[13px] text-foreground"
      >
        {t('auto.components.status.bar.UsageRosterPanel.usageDetails', 'Usage details & history')}
        <ChevronRight size={14} className="text-muted-foreground" />
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={onManageAccounts}
        className="w-full cursor-pointer justify-between rounded-none px-3.5 py-2.5 text-[13px] text-foreground"
      >
        {t('auto.components.status.bar.StatusBar.75ded02687', 'Manage Accounts…')}
        <ChevronRight size={14} className="text-muted-foreground" />
      </DropdownMenuItem>
    </div>
  )
}
