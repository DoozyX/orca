import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SourceControlRowOpenEvent } from '@/components/right-sidebar/source-control/listing/split-open'
import { useTranslate } from '@/i18n/use-translate'
import type { GitStatusEntry } from '../../../../../shared/git/status/git-status-types'
import {
  GitGraphFileList,
  useGitGraphFileViewMode,
  type GitGraphFileSort
} from './git-graph-file-list'
import { GitGraphFileToolbar } from './git-graph-file-toolbar'
import { gitGraphWipBranchLabel, type GitGraphWipWorkspace } from './git-graph-wip-items'

function WipSection({
  title,
  entries,
  sort,
  viewMode,
  collapseAllRequest,
  onOpenFile
}: {
  title: string
  entries: GitStatusEntry[]
  sort: GitGraphFileSort
  viewMode: 'list' | 'tree'
  collapseAllRequest: number
  onOpenFile: (entry: GitStatusEntry, event: SourceControlRowOpenEvent) => void
}) {
  if (!entries.length) {
    return null
  }
  return (
    <section>
      <div className="px-4 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title} · {entries.length}
      </div>
      <GitGraphFileList
        entries={entries}
        sort={sort}
        viewMode={viewMode}
        collapseAllRequest={collapseAllRequest}
        onOpenFile={onOpenFile}
      />
    </section>
  )
}

export function GitGraphWipDetails({
  workspace,
  fileSort,
  onFileSortChange,
  onOpenFile,
  onSwitch
}: {
  workspace: GitGraphWipWorkspace
  fileSort: GitGraphFileSort
  onFileSortChange: (sort: GitGraphFileSort) => void
  onOpenFile: (entry: GitStatusEntry, event: SourceControlRowOpenEvent) => void
  onSwitch?: () => void
}) {
  const t = useTranslate()
  const [viewMode, setViewMode] = useGitGraphFileViewMode()
  const [collapseAllRequest, setCollapseAllRequest] = useState(0)
  const branch = gitGraphWipBranchLabel(workspace)
  const count = workspace.entries.length
  const staged = workspace.entries.filter((entry) => entry.area === 'staged')
  const changes = workspace.entries.filter((entry) => entry.area !== 'staged')
  return (
    <div>
      <div className="space-y-2 p-4">
        <h2 className="text-sm font-semibold" data-testid="git-graph-wip-heading">
          {count === 1
            ? t('gitGraph.wipFileChange', '1 file change on {{branch}}', { branch })
            : t('gitGraph.wipFileChanges', '{{total}} file changes on {{branch}}', {
                total: workspace.didHitLimit ? `${count}+` : String(count),
                branch
              })}
        </h2>
        {onSwitch && (
          <Button size="xs" variant="outline" onClick={onSwitch} data-testid="git-graph-wip-switch">
            <ArrowUpRight />
            {t('gitGraph.switchWorkspace', 'Switch to workspace')}
          </Button>
        )}
      </div>
      <GitGraphFileToolbar
        sort={fileSort}
        onSortChange={onFileSortChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onCollapseAll={() => setCollapseAllRequest((request) => request + 1)}
      />
      <WipSection
        title={t('gitGraph.wipStaged', 'Staged')}
        entries={staged}
        sort={fileSort}
        viewMode={viewMode}
        collapseAllRequest={collapseAllRequest}
        onOpenFile={onOpenFile}
      />
      <WipSection
        title={t('gitGraph.wipChanges', 'Changes')}
        entries={changes}
        sort={fileSort}
        viewMode={viewMode}
        collapseAllRequest={collapseAllRequest}
        onOpenFile={onOpenFile}
      />
    </div>
  )
}
