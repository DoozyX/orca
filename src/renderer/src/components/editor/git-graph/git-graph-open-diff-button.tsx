import { FileDiff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'

export function GitGraphOpenDiffButton({ onOpen }: { onOpen: () => void }) {
  const t = useTranslate()
  return (
    <Button variant="outline" size="xs" onClick={onOpen}>
      <FileDiff className="size-3.5" />
      {t('gitGraph.openDiff', 'Open diff')}
    </Button>
  )
}
