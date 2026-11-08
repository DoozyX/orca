import type { ReactNode } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import type { AntigravityAccountUsage } from '../../../../shared/rate-limit-types'
import { AntigravityUsageMenu } from './AntigravityUsageMenu'
import { ClaudeSwitcherMenu } from './ClaudeSwitcherMenu'
import { CodexSwitcherMenu } from './CodexSwitcherMenu'
import { ProviderDetailsMenu } from './ProviderDetailsMenu'
import { entryRateLimits, type AccountUsageEntry } from './account-usage-entry'

export function AccountUsageDetailsMenu({
  entry,
  compact,
  row,
  antigravityAccounts,
  onManageAntigravityAccounts
}: {
  entry: AccountUsageEntry
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
        codex={p}
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
