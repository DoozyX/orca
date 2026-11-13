import { Pin } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { getProviderDisplayName } from '../../../../shared/usage-provider-windows'
import type { AccountUsageEntry } from './account-usage-entry'
import { entryRateLimits } from './account-usage-entry'
import { ProviderSegment } from './StatusBarProviderSegment'
import type { UsagePercentageDisplay } from '../../../../shared/usage-percentage-display'
import type { StatusBarUsageMode } from '../../../../shared/status-bar-usage-mode'

export function AccountUsageSegment({
  entry,
  compact,
  display,
  mode
}: {
  entry: AccountUsageEntry
  compact: boolean
  display: UsagePercentageDisplay
  mode: StatusBarUsageMode
}): React.JSX.Element {
  const t = useTranslate()
  const p = entryRateLimits(entry)
  const account = entry.label
    ? `${getProviderDisplayName(entry.provider)} · ${entry.label}`
    : getProviderDisplayName(entry.provider)
  const assignedBy = entry.assignedBy
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5"
      title={
        assignedBy
          ? assignedBy.kind === 'group'
            ? t(
                'auto.components.claudeAccountAssignment.chipFromGroup',
                '{{account}} · this workspace uses it (group {{name}})',
                { account, name: assignedBy.name }
              )
            : t(
                'auto.components.claudeAccountAssignment.chipFromProject',
                '{{account}} · this workspace uses it (project {{name}})',
                { account, name: assignedBy.name }
              )
          : account
      }
      data-account-usage={entry.key}
      data-account-assigned={assignedBy ? assignedBy.kind : undefined}
    >
      {assignedBy ? <Pin className="size-3 text-muted-foreground" aria-hidden /> : null}
      {entry.label ? <span className="max-w-32 truncate text-xs">{entry.label}</span> : null}
      <ProviderSegment p={p} compact={compact} display={display} mode={mode} />
    </span>
  )
}
