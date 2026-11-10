import { SquareArrowOutUpRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGitGraphSupport } from './use-git-graph-support'
import { gitGraphUpdateMessage, openGitGraph } from '@/lib/source-control/graph/git-graph-tab'
import { toSourceControlRowOpenEvent, type SourceControlRowOpenEvent } from '../listing/split-open'
import { useTranslate } from '@/i18n/use-translate'
import { CommitsHeaderIconButton } from './commits-header-icon-button'

export function GitGraphOpenButton({
  worktreeId,
  onOpen
}: {
  worktreeId: string
  onOpen?: (event: SourceControlRowOpenEvent) => void
}) {
  const t = useTranslate()
  const support = useGitGraphSupport(worktreeId)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <CommitsHeaderIconButton
            disabled={support !== true}
            aria-label={t('gitGraph.title', 'Git Graph')}
            onClick={(event) => {
              event.stopPropagation()
              if (onOpen) {
                onOpen(toSourceControlRowOpenEvent(event))
                return
              }
              void openGitGraph(worktreeId)
            }}
          >
            <SquareArrowOutUpRight className="size-3.5" />
          </CommitsHeaderIconButton>
        </span>
      </TooltipTrigger>
      {support !== null && (
        <TooltipContent>
          {support ? t('gitGraph.title', 'Git Graph') : gitGraphUpdateMessage(worktreeId, t)}
        </TooltipContent>
      )}
    </Tooltip>
  )
}
