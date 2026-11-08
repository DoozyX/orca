import { useMemo, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslate } from '@/i18n/use-translate'
import { useGitGraphRefOwner, useGitGraphRefSearch, type RefRequests } from './git-graph-ref-source'
import type { GitHistoryRefs } from '../../../../../shared/git/history/git-history-types'
import type { ExecutionHostId } from '../../../../../shared/execution-host'

type GitGraphFilterProps = {
  worktreeId: string
  executionHostId?: ExecutionHostId
  filter: GitHistoryRefs
  supported: boolean | undefined
  onChange: (refs: GitHistoryRefs) => void
}

export function GitGraphFilter(props: GitGraphFilterProps) {
  const { owner, requests } = useGitGraphRefOwner(props.worktreeId, props.executionHostId)
  return <GitGraphFilterForOwner key={owner} {...props} owner={owner} requests={requests} />
}

function GitGraphFilterForOwner({
  worktreeId,
  executionHostId,
  filter,
  supported,
  onChange,
  owner,
  requests
}: GitGraphFilterProps & { owner: string; requests: RefObject<RefRequests> }) {
  const t = useTranslate()
  const [draft, setDraft] = useState<GitHistoryRefs>()
  const [query, setQuery] = useState('')
  const pickerOpen = draft !== undefined
  const draftRefs = draft ?? filter
  const search = useGitGraphRefSearch({
    worktreeId,
    executionHostId,
    owner,
    requests,
    query,
    enabled: pickerOpen
  })
  const { capable, error } = search
  const refs = search.refs ?? []
  const chosen = useMemo(() => new Set(Array.isArray(draftRefs) ? draftRefs : []), [draftRefs])
  const apply = (refs = draftRefs) => {
    const next = Array.isArray(refs) && !refs.length ? 'all' : refs
    if (draft !== undefined && JSON.stringify(next) !== JSON.stringify(filter)) {
      onChange(next)
    }
    setDraft(undefined)
    search.reset()
  }
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Popover
        open={pickerOpen}
        onOpenChange={(next) => {
          if (next) {
            setDraft(filter)
          } else {
            apply()
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" disabled={!supported || capable !== true}>
            {supported === false || filter === 'head'
              ? t('gitGraph.currentBranch', 'Current branch')
              : filter === 'all'
                ? t('gitGraph.allBranches', 'All branches')
                : t('gitGraph.chosenBranches', 'Chosen branches')}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80"
          align="start"
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            setDraft(undefined)
            search.reset()
          }}
        >
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => apply('all')}>
                {t('gitGraph.allBranches', 'All branches')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => apply('head')}>
                {t('gitGraph.currentBranch', 'Current branch')}
              </Button>
            </div>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('gitGraph.searchRefs', 'Search branches and tags')}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="max-h-72 overflow-auto scrollbar-sleek">
              {refs.map((ref) => (
                <label
                  key={ref.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                >
                  <Checkbox
                    checked={chosen.has(ref.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(chosen)
                      if (checked) {
                        next.add(ref.id)
                      } else {
                        next.delete(ref.id)
                      }
                      setDraft([...next].sort())
                    }}
                  />
                  <span className="truncate">{ref.name}</span>
                </label>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {capable === false || (supported === false && capable === true) ? (
        <span className="text-xs text-muted-foreground">
          {t('gitGraph.oldServer', "This server's Orca version shows only the current branch")}
        </span>
      ) : null}
    </div>
  )
}
