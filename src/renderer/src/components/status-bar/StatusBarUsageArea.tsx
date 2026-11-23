import React from 'react'
import { RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { UsageRosterPanel } from './usage/UsageRosterPanel'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './composition/status-bar-context-menu-policy'
import { StatusBarUsageEmptyCta } from './usage/StatusBarUsageEmptyCta'
import { StatusBarUsageChangeNotices } from './usage/StatusBarUsageChangeNotices'
import { AccountUsageSegment } from './AccountUsageSegment'
import { AccountUsageDetailsMenu } from './AccountUsageDetailsMenu'
import { entryRateLimits } from './account-usage-entry'
import { UsageOverflowChip, isUsageUrgent } from './usage/StatusBarProviderSegment'
import {
  USAGE_ROW_LEVELS,
  chooseUsageRowLayout,
  type UsageChipFacts,
  type UsageRowLayout
} from './composition/status-bar-usage-collapse'
import { useUsageRowWidths } from './composition/use-usage-row-widths'
import { UsageUnitLabel, usageChipShowsPercentage } from './usage/usage-unit-label'
import type { useStatusBarController } from './composition/use-status-bar-controller'
import { isOwnerNotSetUpPlaceholder } from './usage/owner-usage-rate-limits'

type StatusBarController = NonNullable<ReturnType<typeof useStatusBarController>>

/** The status bar's usage chips, their roster popover and the refresh button. */
export function StatusBarUsageArea({
  controller
}: {
  controller: StatusBarController
}): React.JSX.Element {
  const t = useTranslate()
  const [usageAreaRef, usageWidths] = useUsageRowWidths()
  const {
    antigravityAccounts,
    anyFetching,
    anyVisible,
    canSignInFromUsageRow,
    handleManageAccounts,
    handleOpenProviderAccounts,
    handleRefresh,
    handleUsageDetails,
    handleUsageMenuOpenChange,
    hasVisibleUsageMeters,
    isEmptyUsageState,
    isRefreshing,
    ownerUsage,
    remoteOwner,
    setStatusBarUsageMode,
    showEmptyUsageCta,
    statusBarUsageMode,
    usageMenuFocusHandoff,
    usageEntries,
    usageMenuOpen,
    usagePercentageDisplay
  } = controller
  const levelMode = (level: number) =>
    USAGE_ROW_LEVELS[level]?.tightestOnly ? 'compact' : statusBarUsageMode
  // Why: several accounts can share a provider, so collapse and measurement key on the entry key.
  const chipFacts: UsageChipFacts[] = usageEntries.map((entry) => {
    const p = entryRateLimits(entry)
    return {
      provider: entry.key,
      urgent: isUsageUrgent(p),
      percentage: [
        usageChipShowsPercentage(p, levelMode(0), t),
        usageChipShowsPercentage(p, levelMode(1), t),
        usageChipShowsPercentage(p, levelMode(2), t)
      ]
    }
  })
  const usageLayout: UsageRowLayout = usageWidths
    ? chooseUsageRowLayout(usageWidths, chipFacts)
    : { level: 0, collapsed: [] }
  const usageMode = levelMode(usageLayout.level)
  const usageCompact = USAGE_ROW_LEVELS[usageLayout.level]?.compact ?? false
  const shownEntries = usageEntries.filter((entry) => !usageLayout.collapsed.includes(entry.key))
  const hiddenEntries = usageEntries.filter((entry) => usageLayout.collapsed.includes(entry.key))
  const showUnitLabel = shownEntries.some((entry) =>
    usageChipShowsPercentage(entryRateLimits(entry), usageMode, t)
  )

  // Why: usage gives way first, but keeps enough width to stay clickable; its popover holds
  // every provider. Its form is chosen from widths measured off-layout (see useUsageRowWidths).
  return (
    <div
      ref={usageAreaRef}
      data-usage-area=""
      className={cn(
        'relative flex flex-1 items-center overflow-clip [overflow-clip-margin:3px]',
        hasVisibleUsageMeters ? 'min-w-16' : 'min-w-0'
      )}
    >
      <div data-usage-row="" className="flex shrink-0 items-center gap-3">
        {isEmptyUsageState ? (
          showEmptyUsageCta ? (
            <StatusBarUsageEmptyCta remoteOwner={remoteOwner} />
          ) : null
        ) : hasVisibleUsageMeters ? (
          <StatusBarUsageChangeNotices hasVisibleUsageMeters={hasVisibleUsageMeters}>
            <DropdownMenu
              open={usageMenuOpen}
              onOpenChange={handleUsageMenuOpenChange}
              modal={false}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-usage-trigger=""
                  className="inline-flex items-center gap-3 rounded px-1 py-0.5 hover:bg-accent/70"
                  aria-label={t('auto.components.status.bar.UsageRosterPanel.title', 'Usage')}
                  title={remoteOwner?.label}
                >
                  {showUnitLabel ? <UsageUnitLabel display={usagePercentageDisplay} /> : null}
                  {shownEntries.map((entry) => (
                    <AccountUsageSegment
                      key={entry.key}
                      entry={entry}
                      compact={usageCompact}
                      display={usagePercentageDisplay}
                      mode={usageMode}
                    />
                  ))}
                  {hiddenEntries.length > 0 ? (
                    <UsageOverflowChip
                      hidden={hiddenEntries.map(entryRateLimits)}
                      providerCount={usageEntries.length}
                      display={usagePercentageDisplay}
                    />
                  ) : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
                side="top"
                align="start"
                sideOffset={8}
                // Reserve footer height so the popover and drill-in submenus stay above the status bar.
                collisionPadding={{ top: 8, bottom: 32, left: 8, right: 8 }}
                variant="picker"
                className="w-[440px] max-w-[calc(100vw-1rem)]"
                onPointerDownOutside={usageMenuFocusHandoff.onPointerDownOutside}
                onCloseAutoFocus={usageMenuFocusHandoff.onCloseAutoFocus}
              >
                <UsageRosterPanel
                  actionsAvailable={remoteOwner === null || remoteOwner.environmentId !== null}
                  unavailableReason={remoteOwner?.unavailableReason}
                  entries={usageEntries}
                  display={usagePercentageDisplay}
                  statusBarUsageMode={statusBarUsageMode}
                  onStatusBarUsageModeChange={setStatusBarUsageMode}
                  isRefreshing={isRefreshing || anyFetching}
                  onRefresh={handleRefresh}
                  onOpenProvider={handleOpenProviderAccounts}
                  onSignIn={handleOpenProviderAccounts}
                  canSignIn={canSignInFromUsageRow}
                  onManageAccounts={handleManageAccounts}
                  onUsageDetails={handleUsageDetails}
                  renderRow={(p, rowNode, entry) =>
                    // Why: a placeholder has nothing to drill into; its row opens the host's accounts.
                    isOwnerNotSetUpPlaceholder(p) ? null : (
                      <AccountUsageDetailsMenu
                        entry={entry}
                        ownerUsage={ownerUsage}
                        row={rowNode}
                        antigravityAccounts={antigravityAccounts}
                        onManageAntigravityAccounts={() =>
                          handleOpenProviderAccounts('antigravity')
                        }
                      />
                    )
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </StatusBarUsageChangeNotices>
        ) : null}
        {anyVisible && !isEmptyUsageState && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                data-usage-refresh=""
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                aria-label={t(
                  'auto.components.status.bar.StatusBar.3325d996cb',
                  'Refresh rate limits'
                )}
              >
                <RefreshCw
                  size={11}
                  className={isRefreshing || anyFetching ? 'animate-spin' : ''}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              {t('auto.components.status.bar.StatusBar.c8857b40f7', 'Refresh usage data')}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {hasVisibleUsageMeters ? (
        // Why: every chip in every form, never shown and never changed by the layout choice.
        <div
          aria-hidden="true"
          inert
          className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-center"
        >
          <span data-measure-unit="" className="inline-flex">
            <UsageUnitLabel display={usagePercentageDisplay} />
          </span>
          {usageEntries.flatMap((entry) =>
            USAGE_ROW_LEVELS.map((level, index) => (
              <span
                key={`${entry.key}-${index}`}
                data-measure-chip={entry.key}
                data-measure-level={index}
                className="inline-flex"
              >
                <AccountUsageSegment
                  entry={entry}
                  compact={level.compact}
                  display={usagePercentageDisplay}
                  mode={levelMode(index)}
                  measuring
                />
              </span>
            ))
          )}
          <span data-measure-more="" className="inline-flex">
            <UsageOverflowChip
              hidden={[]}
              providerCount={usageEntries.length}
              display={usagePercentageDisplay}
            />
          </span>
        </div>
      ) : null}
    </div>
  )
}
