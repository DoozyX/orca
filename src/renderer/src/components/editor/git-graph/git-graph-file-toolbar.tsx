import { ArrowDownAZ, ArrowUpZA, ChevronsDownUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import type { SourceControlViewMode } from '../../../../../shared/ui-chrome-types'
import type { GitGraphFileSort } from './git-graph-file-list'

export function GitGraphFileToolbar({
  sort,
  onSortChange,
  viewMode,
  onViewModeChange,
  onCollapseAll
}: {
  sort: GitGraphFileSort
  onSortChange: (sort: GitGraphFileSort) => void
  viewMode: SourceControlViewMode
  onViewModeChange: (mode: SourceControlViewMode) => void
  onCollapseAll: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const sortLabel =
    sort === 'asc'
      ? t('gitGraph.sortToDescending', 'Sort Z to A')
      : t('gitGraph.sortToAscending', 'Sort A to Z')
  return (
    <div className="flex items-center gap-1 px-4 pb-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={sortLabel}
            onClick={() => onSortChange(sort === 'asc' ? 'desc' : 'asc')}
          >
            {sort === 'asc' ? (
              <ArrowDownAZ className="size-3.5" />
            ) : (
              <ArrowUpZA className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{sortLabel}</TooltipContent>
      </Tooltip>
      <ToggleGroup
        type="single"
        size="xs"
        variant="outline"
        value={viewMode}
        onValueChange={(next) => {
          // Pressing the selected mode again would clear it; the list always has one.
          if (next === 'list' || next === 'tree') {
            onViewModeChange(next)
          }
        }}
        aria-label={t('gitGraph.fileViewMode', 'File list layout')}
      >
        <ToggleGroupItem value="list">{t('gitGraph.viewPath', 'Path')}</ToggleGroupItem>
        <ToggleGroupItem value="tree">{t('gitGraph.viewTree', 'Tree')}</ToggleGroupItem>
      </ToggleGroup>
      {viewMode === 'tree' && (
        <Button size="xs" variant="ghost" className="ml-auto" onClick={onCollapseAll}>
          <ChevronsDownUp />
          {t('gitGraph.collapseAll', 'Collapse All')}
        </Button>
      )}
    </div>
  )
}
