import type { ReactNode } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import type { AntigravityAccountUsage } from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { AntigravityUsageMenu } from './usage/AntigravityUsageMenu'
import { ClaudeSwitcherMenu } from './accounts/ClaudeSwitcherMenu'
import { CodexSwitcherMenu } from './accounts/CodexSwitcherMenu'
import { ProviderDetailsMenu } from './usage/ProviderDetailsMenu'
import { entryRateLimits, type AccountUsageEntry } from './account-usage-entry'
import { getUsageOwnerHostScope } from './usage/use-owner-usage-rate-limits'
import type { OwnerUsageRateLimits } from './usage/use-owner-usage-rate-limits'
import { getProviderAccountsOwnerKey } from '@/runtime/provider-accounts/observations/runtime-provider-accounts-client'

export function AccountUsageDetailsMenu({
  entry,
  ownerUsage,
  compact,
  row,
  antigravityAccounts,
  onManageAntigravityAccounts
}: {
  entry: AccountUsageEntry
  ownerUsage: OwnerUsageRateLimits
  compact: boolean
  row: ReactNode
  antigravityAccounts: readonly AntigravityAccountUsage[]
  onManageAntigravityAccounts: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const p = entryRateLimits(entry)
  if (entry.selected && p.provider === 'claude') {
    return (
      <ClaudeSwitcherMenu
        claude={p}
        compact={compact}
        iconOnly={false}
        asSubmenu
        triggerContent={row}
      />
    )
  }
  if (entry.selected && p.provider === 'antigravity') {
    return (
      <AntigravityUsageMenu
        antigravity={p}
        accounts={antigravityAccounts}
        compact={compact}
        triggerContent={row}
        onManageAccounts={onManageAntigravityAccounts}
      />
    )
  }
  if (entry.selected && p.provider === 'codex') {
    return (
      <CodexSwitcherMenu
        key={getProviderAccountsOwnerKey(getUsageOwnerHostScope(ownerUsage.remoteOwner))}
        codex={p}
        ownerUsage={ownerUsage}
        compact={compact}
        iconOnly={false}
        asSubmenu
        triggerContent={row}
      />
    )
  }
  return (
    <ProviderDetailsMenu
      provider={p}
      compact={compact}
      iconOnly={false}
      asSubmenu
      triggerContent={row}
      ariaLabel={t('auto.components.status.bar.UsageRosterPanel.openDetails', 'Open usage details')}
      topContent={entry.label ? <div className="px-3 pt-2 text-xs">{entry.label}</div> : undefined}
    />
  )
}
