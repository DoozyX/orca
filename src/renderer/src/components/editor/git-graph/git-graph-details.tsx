import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { Trans } from 'react-i18next'
import { i18n } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  GitHistoryCommitFiles,
  type GitHistoryCommitFilesState
} from '@/components/right-sidebar/source-control/sync/git-history-commit-files'
import { formatGitHistoryTimestamp } from '@/components/right-sidebar/source-control/sync/git-history-format'
import type { useGitHistoryCommitActions } from '@/components/right-sidebar/source-control/sync/use-git-history-commit-actions'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'
import { useIntlLocale, useTranslate, type Translate } from '@/i18n/use-translate'
import { GitAuthorAvatar } from './git-author-avatar'
import {
  GitGraphFileList,
  useGitGraphFileViewMode,
  type GitGraphFileSort
} from './git-graph-file-list'
import { GitGraphFileToolbar } from './git-graph-file-toolbar'
import { GIT_FILE_STATUS_SUMMARY_ORDER, summarizeFileChanges } from './git-graph-file-summary'
import type { GitFileStatus } from '../../../../../shared/git/status/git-status-types'

export function GitGraphDetails({
  item,
  commitActions,
  actions,
  fileSort,
  onFileSortChange,
  onParent
}: {
  item: GitHistoryItem
  commitActions?: ReactNode
  actions: ReturnType<typeof useGitHistoryCommitActions>
  fileSort: GitGraphFileSort
  onFileSortChange: (sort: GitGraphFileSort) => void
  onParent: (id: string) => void
}) {
  const t = useTranslate()
  const intlLocale = useIntlLocale()
  const [viewMode, setViewMode] = useGitGraphFileViewMode()
  const [collapseAllRequest, setCollapseAllRequest] = useState(0)
  const [files, setFiles] = useState<GitHistoryCommitFilesState>({ status: 'loading' })
  const loadFiles = actions.loadCommitFiles
  useEffect(() => {
    let live = true
    setFiles({ status: 'loading' })
    void loadFiles(item)
      .then((entries) => {
        if (live) {
          setFiles({ status: 'ready', entries })
        }
      })
      .catch((cause) => {
        if (live) {
          setFiles({ status: 'error', error: String(cause) })
        }
      })
    return () => {
      live = false
    }
  }, [item, loadFiles])
  const hasFiles = files.status === 'ready' && files.entries.length > 0
  const shortId = item.displayId ?? item.id.slice(0, 7)
  const authoredAt = formatGitHistoryTimestamp(item.timestamp, intlLocale)
  return (
    <div>
      <div className="space-y-3 p-4">
        <div className="flex min-w-0 items-center gap-1">
          <h2 className="min-w-0 truncate text-sm font-semibold">
            <Trans
              i18n={i18n}
              defaults={t('gitGraph.commitHeading', 'commit <id>{{id}}</id>')}
              values={{ id: shortId }}
              components={{ id: <span className="font-mono" /> }}
            />
          </h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={t('gitGraph.copyHash', 'Copy commit hash')}
                onClick={() => actions.handleCommitAction('copy-hash', item)}
              >
                <Copy className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('gitGraph.copyHash', 'Copy commit hash')}</TooltipContent>
          </Tooltip>
        </div>
        {commitActions}
        <div
          className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-2 text-xs scrollbar-sleek"
          data-testid="git-graph-commit-message"
        >
          {item.message}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <GitAuthorAvatar name={item.author} email={item.authorEmail} size={24} />
          <div className="min-w-0">
            <div className="truncate font-medium">{item.author}</div>
            {authoredAt && (
              <div className="truncate text-muted-foreground">
                {t('gitGraph.authored', 'authored {{date}}', { date: authoredAt })}
              </div>
            )}
          </div>
        </div>
        {!!item.parentIds.length && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t('gitGraph.parents', 'Parents')}</span>
            {item.parentIds.map((id) => (
              <Button key={id} variant="ghost" size="xs" onClick={() => onParent(id)}>
                <span className="font-mono text-2xs">{id.slice(0, 7)}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        {hasFiles ? (
          <span>{formatChangeSummary(files.entries, t)}</span>
        ) : (
          <span className="text-2xs font-semibold uppercase tracking-wider">
            {t('gitGraph.files', 'Files')}
          </span>
        )}
      </div>
      {hasFiles && (
        <GitGraphFileToolbar
          sort={fileSort}
          onSortChange={onFileSortChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onCollapseAll={() => setCollapseAllRequest((request) => request + 1)}
        />
      )}
      <GitHistoryCommitFiles
        state={files}
        onOpenAll={() => void actions.openHistoryCommitDiff(item)}
        renderEntries={(entries) => (
          <GitGraphFileList
            entries={entries}
            sort={fileSort}
            viewMode={viewMode}
            collapseAllRequest={collapseAllRequest}
            onOpenFile={(entry, event) => actions.openCommitFile(item, entry, event)}
          />
        )}
      />
    </div>
  )
}

function formatChangeSummary(entries: readonly { status: GitFileStatus }[], t: Translate) {
  const counts = summarizeFileChanges(entries)
  const labels: Record<GitFileStatus, (total: string) => string> = {
    modified: (total) => t('gitGraph.fileStatus.modified', '{{total}} modified', { total }),
    added: (total) => t('gitGraph.fileStatus.added', '{{total}} added', { total }),
    deleted: (total) => t('gitGraph.fileStatus.deleted', '{{total}} deleted', { total }),
    renamed: (total) => t('gitGraph.fileStatus.renamed', '{{total}} renamed', { total }),
    copied: (total) => t('gitGraph.fileStatus.copied', '{{total}} copied', { total }),
    untracked: (total) => t('gitGraph.fileStatus.untracked', '{{total}} untracked', { total })
  }
  return GIT_FILE_STATUS_SUMMARY_ORDER.filter((status) => counts[status])
    .map((status) => labels[status](String(counts[status])))
    .join(' · ')
}
