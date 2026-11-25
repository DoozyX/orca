import { createElement } from 'react'
import type React from 'react'
import { STATUS_COLORS } from '../../../../lib/source-control/paths/git-path-decoration'
import { STATUS_LABELS } from '../../../../../../shared/git/status/git-status-labels'
import {
  toPermanentSourceControlRowOpenEvent,
  toSourceControlRowOpenEvent,
  type SourceControlRowOpenEvent
} from '../listing/split-open'
import {
  SOURCE_CONTROL_TREE_FILE_PADDING_PX,
  SOURCE_CONTROL_TREE_INDENT_PX
} from '../listing/row-layout'
import { FileTypeIcon } from '@/components/icons/FileTypeIcon'
import { basename, dirname } from '@/lib/path'
import { useTranslate } from '@/i18n/use-translate'
import type { GitBranchChangeEntry } from '../../../../../../shared/git/diff/git-diff-compare-types'
import type { GitFileStatus } from '../../../../../../shared/git/status/git-status-types'

export type GitHistoryCommitFilesState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; entries: GitBranchChangeEntry[] }

export function CommitFileRow<
  E extends { path: string; status: GitFileStatus; added?: number; removed?: number }
>({
  entry,
  depth,
  onOpen
}: {
  entry: E
  // Set for tree rows: indent by depth and drop the folder hint the tree already shows.
  depth?: number
  onOpen: (entry: E, event: SourceControlRowOpenEvent) => void
}): React.JSX.Element {
  const status = entry.status
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = parentDir === '.' || depth !== undefined ? '' : parentDir

  return (
    <button
      type="button"
      className="group flex w-full min-w-0 cursor-pointer items-center gap-1 py-1 pr-3 text-left text-xs transition-colors hover:bg-accent/40"
      style={{
        paddingLeft:
          depth === undefined
            ? '2.25rem'
            : `${depth * SOURCE_CONTROL_TREE_INDENT_PX + SOURCE_CONTROL_TREE_FILE_PADDING_PX}px`
      }}
      title={entry.path}
      data-testid="git-history-commit-file"
      onClick={(event) => onOpen(entry, toSourceControlRowOpenEvent(event))}
      onDoubleClick={(event) => onOpen(entry, toPermanentSourceControlRowOpenEvent(event))}
    >
      {createElement(FileTypeIcon, {
        filePath: entry.path,
        className: 'size-3.5 shrink-0',
        style: { color: STATUS_COLORS[status] }
      })}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="min-w-0 truncate text-left text-foreground" dir="rtl">
          <bdi>{fileName}</bdi>
        </span>
        {dirPath && (
          <span
            className="min-w-0 flex-1 truncate text-left text-2xs text-muted-foreground"
            dir="rtl"
          >
            <bdi>{dirPath}</bdi>
          </span>
        )}
      </span>
      <span className="shrink-0 font-mono text-2xs text-[color:var(--git-decoration-added)]">
        {entry.added !== undefined ? `+${entry.added}` : ''}
      </span>
      <span className="shrink-0 font-mono text-2xs text-[color:var(--git-decoration-deleted)]">
        {entry.removed !== undefined ? `−${entry.removed}` : ''}
      </span>
      <span
        className="w-4 shrink-0 text-center text-[10px] font-bold"
        style={{ color: STATUS_COLORS[status] }}
      >
        {STATUS_LABELS[status]}
      </span>
    </button>
  )
}

function CommitFilesBody({
  state,
  renderEntries
}: {
  state: GitHistoryCommitFilesState
  renderEntries: (entries: GitBranchChangeEntry[]) => React.ReactNode
}): React.JSX.Element {
  const t = useTranslate()
  if (state.status === 'loading') {
    return <div className="h-6" />
  }

  if (state.status === 'error') {
    return (
      <div className="py-1 pl-9 pr-3 text-[11px] text-destructive" title={state.error}>
        {state.error}
      </div>
    )
  }

  if (state.entries.length === 0) {
    return (
      <div className="py-1 pl-9 pr-3 text-[11px] text-muted-foreground">
        {t(
          'auto.components.right.sidebar.GitHistoryCommitFiles.b2c3d4e5f6',
          'No file changes in this commit'
        )}
      </div>
    )
  }

  return <>{renderEntries(state.entries)}</>
}

export function GitHistoryCommitFiles({
  state,
  renderEntries
}: {
  state: GitHistoryCommitFilesState
  renderEntries: (entries: GitBranchChangeEntry[]) => React.ReactNode
}): React.JSX.Element {
  return (
    <div className="border-l border-border/60 bg-muted/20">
      <CommitFilesBody state={state} renderEntries={renderEntries} />
    </div>
  )
}
