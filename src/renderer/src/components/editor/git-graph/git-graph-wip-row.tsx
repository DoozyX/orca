import { Minus, Pencil, Plus, type LucideIcon } from 'lucide-react'
import { GitHistoryGraphSvg } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitHistoryItemViewModel } from '../../../../../shared/git/history/git-history-graph'
import { cn } from '@/lib/utils'
import { useTranslate } from '@/i18n/use-translate'
import { gitGraphWipBranchLabel, summarizeGitGraphWipCounts } from './git-graph-wip-items'
import type { GitGraphWipWorkspace } from './git-graph-wip-items'

function WipCount({
  icon: Icon,
  count,
  didHitLimit
}: {
  icon: LucideIcon
  count: number
  didHitLimit: boolean
}) {
  if (!count) {
    return null
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {count}
      {didHitLimit && '+'}
    </span>
  )
}

export function GitGraphWipRow({
  workspace,
  viewModel,
  className,
  style,
  selected,
  onSelect
}: {
  workspace: GitGraphWipWorkspace
  viewModel: GitHistoryItemViewModel
  className: string
  style: React.CSSProperties
  selected: boolean
  onSelect: () => void
}) {
  const t = useTranslate()
  const counts = summarizeGitGraphWipCounts(workspace.entries)
  return (
    <div
      className={cn(className, selected && 'bg-accent')}
      style={style}
      data-current={selected}
      data-wip={workspace.worktreeId}
      onClick={onSelect}
    >
      <span />
      <div className="min-w-0 overflow-hidden">
        <GitHistoryGraphSvg viewModel={viewModel} variant="avatar" />
      </div>
      <div
        className="col-span-4 flex min-w-0 items-center gap-2 pr-3"
        title={workspace.current ? undefined : workspace.displayName}
      >
        <span className="shrink-0 font-medium">{t('gitGraph.wip', '// WIP')}</span>
        <WipCount icon={Pencil} count={counts.changed} didHitLimit={workspace.didHitLimit} />
        <WipCount icon={Plus} count={counts.added} didHitLimit={workspace.didHitLimit} />
        <WipCount icon={Minus} count={counts.deleted} didHitLimit={workspace.didHitLimit} />
        {!workspace.current && (
          <span className="min-w-0 truncate italic text-muted-foreground">
            {t('gitGraph.wipOnBranch', 'on {{branch}}', {
              branch: gitGraphWipBranchLabel(workspace)
            })}
          </span>
        )}
      </div>
    </div>
  )
}
