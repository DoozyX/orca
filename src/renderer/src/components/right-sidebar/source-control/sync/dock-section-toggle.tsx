import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DockSectionToggle({
  label,
  count,
  collapsed,
  onToggle
}: {
  label: string
  count?: ReactNode
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 flex-1 items-center gap-1 px-0.5 text-left text-2xs font-semibold uppercase tracking-wider text-foreground/70"
      aria-expanded={!collapsed}
      onClick={onToggle}
    >
      <ChevronDown
        className={cn('size-3 shrink-0 transition-transform', collapsed && '-rotate-90')}
      />
      <span>{label}</span>
      {count}
    </button>
  )
}
