import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, ChevronDown, Cloud, Laptop, Tag } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useTranslate } from '@/i18n/use-translate'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'
import {
  gitRefDisplayName,
  gitRefGroupKey,
  groupGitRefs,
  isGitRefListTruncated,
  type GitRefTreeGroup
} from './git-ref-groups'

const COLLAPSED_GROUP_THRESHOLD = 200

type GitRefTreeProps = {
  refs: GitHistoryItemRef[]
  currentRefId?: string
  isVisible?: (refId: string) => boolean
  onToggle?: (refIds: string[], visible: boolean) => void
  onJump: (ref: GitHistoryItemRef) => void
  /** Lets the host refetch matches beyond the page it already holds. */
  onQueryChange?: (query: string) => void
}

type Row =
  | {
      kind: 'group'
      key: string
      group: GitRefTreeGroup
      matches: GitHistoryItemRef[]
      expanded: boolean
    }
  | { kind: 'ref'; key: string; group: GitRefTreeGroup; ref: GitHistoryItemRef }

function GroupIcon({ group }: { group: GitRefTreeGroup }) {
  const Icon = group.kind === 'local' ? Laptop : group.kind === 'tags' ? Tag : Cloud
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />
}

export function GitRefTree({
  refs,
  currentRefId,
  isVisible,
  onToggle,
  onJump,
  onQueryChange
}: GitRefTreeProps) {
  const t = useTranslate()
  const [query, setQuery] = useState('')
  const [expandedByKey, setExpandedByKey] = useState<Record<string, boolean>>({})
  const scroll = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => groupGitRefs(refs), [refs])
  const needle = query.trim().toLowerCase()
  const rows = useMemo(() => {
    const next: Row[] = []
    for (const group of groups) {
      const matches = needle
        ? group.refs.filter((ref) => ref.name.toLowerCase().includes(needle))
        : group.refs
      if (!matches.length) {
        continue
      }
      const key = gitRefGroupKey(group)
      const expanded =
        needle !== '' || (expandedByKey[key] ?? group.refs.length <= COLLAPSED_GROUP_THRESHOLD)
      next.push({ kind: 'group', key, group, matches, expanded })
      if (expanded) {
        for (const ref of matches) {
          next.push({ kind: 'ref', key: ref.id, group, ref })
        }
      }
    }
    return next
  }, [groups, needle, expandedByKey])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 24,
    overscan: 12,
    getItemKey: (index) => rows[index]!.key
  })
  const groupLabel = (group: GitRefTreeGroup) =>
    group.kind === 'local'
      ? t('gitGraph.localRefs', 'Local')
      : group.kind === 'tags'
        ? t('gitGraph.tagRefs', 'Tags')
        : group.remote
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 p-2">
        <Input
          density="compact"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            onQueryChange?.(event.target.value.trim())
          }}
          placeholder={t('gitGraph.searchRefs', 'Search branches and tags')}
          aria-label={t('gitGraph.searchRefs', 'Search branches and tags')}
        />
      </div>
      {isGitRefListTruncated(refs) && (
        <p className="shrink-0 px-3 pb-1 text-2xs text-muted-foreground">
          {t('gitGraph.refsTruncated', 'Showing only the first 1,000 branches and tags')}
        </p>
      )}
      <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]!
            const style = { transform: `translateY(${virtualRow.start}px)` }
            const rowClass =
              'absolute left-0 top-0 flex h-6 w-full items-center gap-1.5 px-2 text-xs'
            if (row.kind === 'group') {
              const ids = row.matches.map((ref) => ref.id)
              const visibleCount = isVisible ? ids.filter(isVisible).length : 0
              return (
                <div key={row.key} className={cn(rowClass, 'hover:bg-accent')} style={style}>
                  {onToggle && isVisible && (
                    <Checkbox
                      aria-label={groupLabel(row.group)}
                      checked={
                        visibleCount === ids.length
                          ? true
                          : visibleCount === 0
                            ? false
                            : 'indeterminate'
                      }
                      onCheckedChange={() => onToggle(ids, visibleCount !== ids.length)}
                    />
                  )}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    aria-expanded={row.expanded}
                    onClick={() =>
                      setExpandedByKey((state) => ({ ...state, [row.key]: !row.expanded }))
                    }
                  >
                    <ChevronDown
                      className={cn(
                        'size-3 shrink-0 transition-transform',
                        !row.expanded && '-rotate-90'
                      )}
                    />
                    <GroupIcon group={row.group} />
                    <span className="truncate font-medium">{groupLabel(row.group)}</span>
                    <span className="text-2xs tabular-nums text-muted-foreground">
                      {row.matches.length}
                    </span>
                  </button>
                </div>
              )
            }
            const { ref, group } = row
            const name = gitRefDisplayName(group, ref)
            return (
              <div key={row.key} className={cn(rowClass, 'pl-5 hover:bg-accent')} style={style}>
                {onToggle && isVisible && (
                  <Checkbox
                    aria-label={name}
                    checked={isVisible(ref.id)}
                    onCheckedChange={(checked) => onToggle([ref.id], checked === true)}
                  />
                )}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  title={name}
                  onClick={() => onJump(ref)}
                >
                  <GroupIcon group={group} />
                  <span className="truncate">{name}</span>
                  {ref.id === currentRefId && <Check className="size-3 shrink-0 text-primary" />}
                </button>
              </div>
            )
          })}
        </div>
        {!rows.length && (
          <div className="p-3 text-xs text-muted-foreground">
            {t('gitGraph.noRefs', 'No matching branches or tags')}
          </div>
        )}
      </div>
    </div>
  )
}
