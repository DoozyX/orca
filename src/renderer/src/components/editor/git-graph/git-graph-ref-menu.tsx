import { useMemo, useState } from 'react'
import { ArrowUpRight, Check, Cloud, Laptop, Tag, type LucideIcon } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import type { gitGraphScope } from '@/lib/git-graph-tab'
import {
  gitGraphWorkspaceBranchRefId,
  gitGraphWorkspaceCatalog
} from './git-graph-workspace-navigation'
import { useTranslate } from '@/i18n/use-translate'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import { groupGitGraphRowRefs, type GitGraphRowRef } from './git-graph-row-refs'
import type {
  GitHistoryGraphColorId,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { cn } from '@/lib/utils'

export function useGitGraphWorkspaces(scope: ReturnType<typeof gitGraphScope>) {
  const worktrees = useAppStore(selectWorktreesByRepo)
  const repos = useAppStore((state) => state.repos)
  return useMemo(
    () =>
      new Map(
        gitGraphWorkspaceCatalog(scope, { repos, worktreesByRepo: worktrees }).map((row) => [
          gitGraphWorkspaceBranchRefId(row.branch),
          row
        ])
      ),
    [scope, worktrees, repos]
  )
}

export function GitGraphRefs({
  references,
  currentRefId,
  color,
  workspaces,
  onSwitch
}: {
  references: GitHistoryItemRef[]
  currentRefId?: string
  color: GitHistoryGraphColorId
  workspaces: Map<string, Worktree>
  onSwitch: (refId: string) => Promise<void>
}) {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const [menuEntry, setMenuEntry] = useState<GitGraphRowRef>()
  const entries = useMemo(
    () => groupGitGraphRowRefs(references, currentRefId),
    [references, currentRefId]
  )
  const inline = entries.slice(0, 1)
  const overflow = entries.slice(1)
  const badge = (entry: GitGraphRowRef) => (
    <ContextMenuTrigger asChild key={entry.local?.id ?? entry.tag?.id ?? entry.remotes[0]!.id}>
      <span
        onContextMenu={(event) => {
          event.stopPropagation()
          setMenuEntry(entry)
        }}
        style={{
          borderColor: graphColor(color),
          backgroundColor: `color-mix(in srgb, ${graphColor(color)} 18%, transparent)`
        }}
        className={cn(
          'inline-flex min-w-0 max-w-full shrink items-center gap-1 rounded-full border px-1.5 text-2xs text-foreground',
          entry.current && 'font-semibold'
        )}
      >
        {entry.local && <RefChipIcon icon={entry.current ? Check : Laptop} color={color} />}
        {entry.remotes.length > 0 && <RefChipIcon icon={Cloud} color={color} />}
        {entry.tag && <RefChipIcon icon={Tag} color={color} />}
        <span className="min-w-0 truncate" title={entry.name}>
          {entry.name}
        </span>
        {entry.local && workspaces.has(entry.local.id) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="shrink-0"
                aria-label={t('gitGraph.switchWorkspace', 'Switch to workspace')}
                onClick={(event) => {
                  event.stopPropagation()
                  void onSwitch(entry.local!.id)
                }}
              >
                <ArrowUpRight className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('gitGraph.switchWorkspace', 'Switch to workspace')}</TooltipContent>
          </Tooltip>
        )}
      </span>
    </ContextMenuTrigger>
  )
  const menuLocalId = menuEntry?.local?.id
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open) {
          setMenuEntry(undefined)
        }
      }}
    >
      <div className="flex w-full min-w-0 gap-1">
        {inline.map(badge)}
        {overflow.length > 0 && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button className="shrink-0 text-2xs text-muted-foreground">
                +{overflow.length}
              </button>
            </PopoverTrigger>
            {open && (
              <PopoverContent>
                <div className="max-h-72 space-y-1 overflow-auto scrollbar-sleek">
                  {overflow.map(badge)}
                </div>
              </PopoverContent>
            )}
          </Popover>
        )}
      </div>
      {menuEntry && (
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => void window.api.ui.writeClipboardText(menuEntry.name)}>
            {t('gitGraph.copyBranch', 'Copy branch name')}
          </ContextMenuItem>
          {menuLocalId && workspaces.has(menuLocalId) && (
            <ContextMenuItem onSelect={() => void onSwitch(menuLocalId)}>
              {t('gitGraph.switchWorkspace', 'Switch to workspace')}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}

function RefChipIcon({ icon: Icon, color }: { icon: LucideIcon; color: GitHistoryGraphColorId }) {
  return <Icon className="size-3 shrink-0" style={{ color: graphColor(color) }} aria-hidden />
}
