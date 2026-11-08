import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { openGitGraph } from '@/lib/git-graph-tab'
import { useTranslate } from '@/i18n/use-translate'
import { GitRefTree } from '@/components/editor/git-graph/git-ref-tree'
import {
  useGitGraphRefOwner,
  useGitRefTreeSource
} from '@/components/editor/git-graph/git-graph-ref-source'

export function BranchesTagsSection({
  worktreeId,
  currentRefId,
  collapsed,
  onToggle
}: {
  worktreeId: string
  currentRefId?: string
  collapsed: boolean
  onToggle: () => void
}) {
  const t = useTranslate()
  const { owner, requests } = useGitGraphRefOwner(worktreeId)
  const { capable, refs, cappedKeys, allRefs, anyGroupCapped, error, setQuery } =
    useGitRefTreeSource({
      worktreeId,
      owner,
      requests,
      enabled: !collapsed
    })
  return (
    <div className="border-b border-border">
      <div className="h-7 pl-1 pr-3">
        <button
          type="button"
          className="flex h-full w-full min-w-0 items-center gap-1 px-0.5 text-left text-2xs font-semibold uppercase tracking-wider text-foreground/70"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <ChevronDown
            className={cn('size-3 shrink-0 transition-transform', collapsed && '-rotate-90')}
          />
          <span>{t('gitGraph.branchesAndTags', 'Branches & Tags')}</span>
          {allRefs && (
            <span className="text-3xs font-medium tabular-nums">
              {allRefs.length}
              {anyGroupCapped && '+'}
            </span>
          )}
        </button>
      </div>
      {!collapsed && (
        <div className="flex flex-col" style={{ height: 'min(192px, 25vh)' }}>
          {capable === false ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t('gitGraph.oldServer', "This server's Orca version shows only the current branch")}
            </p>
          ) : (
            <>
              {error && <p className="shrink-0 px-3 py-2 text-xs text-destructive">{error}</p>}
              {refs && (
                <div className="min-h-0 flex-1">
                  <GitRefTree
                    refs={refs}
                    cappedKeys={cappedKeys}
                    currentRefId={currentRefId}
                    onJump={(ref) => void openGitGraph(worktreeId, { revealRef: ref })}
                    onQueryChange={setQuery}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
