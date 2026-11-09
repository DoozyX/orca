import { useMemo, useState } from 'react'
import { ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTranslate } from '@/i18n/use-translate'
import { countGitGraphAuthors } from './git-graph-author-key'
import { GitGraphCheckList } from './git-graph-check-list'
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'

type GitGraphAuthorFilterProps = {
  items: readonly GitHistoryItem[]
  picked: ReadonlySet<string>
  onChange: (keys: Iterable<string>) => void
}

export function GitGraphAuthorFilter({ items, picked, onChange }: GitGraphAuthorFilterProps) {
  const t = useTranslate()
  const [query, setQuery] = useState('')
  const authors = useMemo(() => countGitGraphAuthors(items), [items])
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? authors.filter(({ name, email }) => `${name} ${email}`.toLowerCase().includes(needle))
    : authors
  const active = picked.size > 0
  const label = t('gitGraph.author', 'Author')
  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <Popover onOpenChange={(open) => !open && setQuery('')}>
        <PopoverTrigger asChild>
          <Button
            variant={active ? 'outline' : 'ghost'}
            size="icon-xs"
            aria-label={
              active
                ? t('gitGraph.filterAuthorsPicked', 'Highlight authors ({{total}} picked)', {
                    total: String(picked.size)
                  })
                : t('gitGraph.filterAuthors', 'Highlight authors')
            }
          >
            <ListFilter />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('gitGraph.searchAuthors', 'Search authors')}
              />
              <Button size="sm" variant="ghost" disabled={!active} onClick={() => onChange([])}>
                {t('gitGraph.clearAuthors', 'Clear')}
              </Button>
            </div>
            <GitGraphCheckList
              rows={visible.map(({ key, name, count }) => ({
                id: key,
                label: name || t('gitGraph.unknownAuthor', 'Unknown'),
                trailing: <span className="text-muted-foreground">{count}</span>
              }))}
              picked={picked}
              onChange={onChange}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
