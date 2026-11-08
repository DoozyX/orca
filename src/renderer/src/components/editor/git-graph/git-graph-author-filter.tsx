import { useMemo, useState } from 'react'
import { ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useTranslate } from '@/i18n/use-translate'
import { countGitGraphAuthors } from './git-graph-author-key'
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
    ? authors.filter(({ key, name }) => `${name} ${key}`.toLowerCase().includes(needle))
    : authors
  const active = picked.size > 0
  const label = t('gitGraph.author', 'Author')
  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <Popover onOpenChange={(open) => !open && setQuery('')}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('gitGraph.filterAuthors', 'Highlight authors')}
            aria-pressed={active}
            className={cn(active && 'bg-accent text-foreground')}
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
            <div className="max-h-72 overflow-auto scrollbar-sleek">
              {visible.map(({ key, name, count }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
                >
                  <Checkbox
                    checked={picked.has(key)}
                    onCheckedChange={(checked) => {
                      const next = new Set(picked)
                      if (checked) {
                        next.add(key)
                      } else {
                        next.delete(key)
                      }
                      onChange(next)
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {name || t('gitGraph.unknownAuthor', 'Unknown')}
                  </span>
                  <span className="text-muted-foreground">{count}</span>
                </label>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
