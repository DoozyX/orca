import { GitGraph } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGitGraphSupport } from './use-git-graph-support'
import { gitGraphUpdateMessage, openGitGraph } from '@/lib/git-graph-tab'
import { useTranslate } from '@/i18n/use-translate'

export function GitGraphOpenButton({ worktreeId }: { worktreeId: string }) {
  const t = useTranslate()
  const support = useGitGraphSupport(worktreeId)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={support !== true}
            aria-label={t('gitGraph.title', 'Git Graph')}
            onClick={() => void openGitGraph(worktreeId)}
          >
            <GitGraph className="size-3.5" />
          </Button>
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
