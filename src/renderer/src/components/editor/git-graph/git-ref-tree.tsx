import {
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Check, ChevronDown, Cloud, Laptop, Tag } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { cn } from '@/lib/utils'
import { useTranslate } from '@/i18n/use-translate'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'
import { formatGitGraphRefLimit } from './git-graph-ref-messages'
import {
  gitRefDisplayName,
  gitRefGroupKey,
  groupGitRefs,
  type GitRefTreeGroup
} from './git-ref-groups'

const COLLAPSED_GROUP_THRESHOLD = 200

type GitRefTreeProps = {
  refs: GitHistoryItemRef[]
  /** Keys of groups whose list stops at the server's page limit. */
  cappedKeys?: string[]
  currentRefId?: string
  /** The ref whose commit is being located; shown busy until the jump settles. */
  pendingRefId?: string
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
      capped: boolean
    }
  | { kind: 'capped-note'; key: string }
  | { kind: 'ref'; key: string; group: GitRefTreeGroup; ref: GitHistoryItemRef }

function RefRow({
  measureRef,
  index,
  style,
  className,
  checkbox,
  button,
  children
}: {
  measureRef: (element: HTMLElement | null) => void
  index: number
  style: CSSProperties
  className?: string
  checkbox?: ReactNode
  button: ButtonHTMLAttributes<HTMLButtonElement>
  children: ReactNode
}) {
  return (
    <div
      ref={measureRef}
      data-index={index}
      className={cn(
        'absolute left-0 top-0 flex min-h-6 w-full items-center gap-1.5 px-2 text-xs hover:bg-accent',
        className
      )}
      style={style}
    >
      {checkbox}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        {...button}
      >
        {children}
      </button>
    </div>
  )
}

function GroupIcon({ group }: { group: GitRefTreeGroup }) {
  const Icon = group.kind === 'local' ? Laptop : group.kind === 'tags' ? Tag : Cloud
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />
}

export function GitRefTree({
  refs,
  cappedKeys,
  currentRefId,
  pendingRefId,
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
        ? group.refs.filter((ref) => ref.id.toLowerCase().includes(needle))
        : group.refs
      if (!matches.length) {
        continue
      }
      const key = gitRefGroupKey(group)
      const expanded =
        needle !== '' || (expandedByKey[key] ?? group.refs.length <= COLLAPSED_GROUP_THRESHOLD)
      const capped = cappedKeys?.includes(key) ?? false
      next.push({ kind: 'group', key, group, matches, expanded, capped })
      if (expanded) {
        for (const ref of matches) {
          next.push({ kind: 'ref', key: ref.id, group, ref })
        }
        if (capped) {
          next.push({ kind: 'capped-note', key: `${key}:capped` })
        }
      }
    }
    return next
  }, [groups, needle, expandedByKey, cappedKeys])
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
      <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]!
            const rowProps = {
              measureRef: virtualizer.measureElement,
              index: virtualRow.index,
              style: { transform: `translateY(${virtualRow.start}px)` }
            }
            if (row.kind === 'capped-note') {
              return (
                <p
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute left-0 top-0 w-full py-1 pl-5 pr-2 text-2xs text-muted-foreground"
                  style={rowProps.style}
                >
                  {t(
                    'gitGraph.groupTruncated',
                    'Only the first {{max}} are listed. Search to find the rest.',
                    { max: formatGitGraphRefLimit() }
                  )}
                </p>
              )
            }
            if (row.kind === 'group') {
              const ids = row.matches.map((ref) => ref.id)
              const visibleCount = isVisible ? ids.filter(isVisible).length : 0
              return (
                <RefRow
                  key={row.key}
                  {...rowProps}
                  checkbox={
                    onToggle &&
                    isVisible && (
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
                    )
                  }
                  button={{
                    'aria-expanded': row.expanded,
                    onClick: () =>
                      setExpandedByKey((state) => ({ ...state, [row.key]: !row.expanded }))
                  }}
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
                    {row.capped && '+'}
                  </span>
                </RefRow>
              )
            }
            const { ref, group } = row
            const name = gitRefDisplayName(group, ref)
            const pending = ref.id === pendingRefId
            return (
              <RefRow
                key={row.key}
                {...rowProps}
                className="pl-5"
                checkbox={
                  onToggle &&
                  isVisible && (
                    <Checkbox
                      aria-label={`${groupLabel(group)}: ${name}`}
                      checked={isVisible(ref.id)}
                      onCheckedChange={(checked) => onToggle([ref.id], checked === true)}
                    />
                  )
                }
                button={{ title: name, 'aria-busy': pending, onClick: () => onJump(ref) }}
              >
                {pending ? (
                  <>
                    <LoadingSpinner className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="sr-only">{t('gitGraph.findingCommit', 'Finding commit')}</span>
                  </>
                ) : (
                  <GroupIcon group={group} />
                )}
                <span className="truncate">{name}</span>
                {ref.id === currentRefId && <Check className="size-3 shrink-0 text-primary" />}
              </RefRow>
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
