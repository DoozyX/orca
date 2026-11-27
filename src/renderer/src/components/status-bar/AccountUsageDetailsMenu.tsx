import type { ReactNode } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { ClaudeSwitcherMenu } from './accounts/ClaudeSwitcherMenu'
import { CodexSwitcherMenu } from './accounts/CodexSwitcherMenu'
import { ProviderDetailsMenu } from './usage/ProviderDetailsMenu'
import { entryRateLimits, type AccountUsageEntry } from './account-usage-entry'
import type { OwnerUsageRateLimits } from './usage/use-owner-usage-rate-limits'

export function AccountUsageDetailsMenu({
  entry,
  ownerUsage,
  row
}: {
  entry: AccountUsageEntry
  ownerUsage: OwnerUsageRateLimits
  row: ReactNode
}): React.JSX.Element {
  const t = useTranslate()
  const p = entryRateLimits(entry)
  if (entry.selected && p.provider === 'claude') {
    return <ClaudeSwitcherMenu claude={p} ownerUsage={ownerUsage} asSubmenu triggerContent={row} />
  }
  if (entry.selected && p.provider === 'codex') {
    return <CodexSwitcherMenu codex={p} ownerUsage={ownerUsage} asSubmenu triggerContent={row} />
  }
  return (
    <ProviderDetailsMenu
      provider={p}
      asSubmenu
      triggerContent={row}
      ariaLabel={t('auto.components.status.bar.UsageRosterPanel.openDetails', 'Open usage details')}
      topContent={entry.label ? <div className="px-3 pt-2 text-xs">{entry.label}</div> : undefined}
    />
  )
}
