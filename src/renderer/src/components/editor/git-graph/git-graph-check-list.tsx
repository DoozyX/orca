import { Checkbox } from '@/components/ui/checkbox'

export type GitGraphCheckRow = { id: string; label: React.ReactNode; trailing?: React.ReactNode }

export function GitGraphCheckList({
  rows,
  picked,
  onChange
}: {
  rows: readonly GitGraphCheckRow[]
  picked: ReadonlySet<string>
  onChange: (picked: Set<string>) => void
}): React.JSX.Element {
  return (
    <div className="max-h-72 overflow-auto scrollbar-sleek">
      {rows.map(({ id, label, trailing }) => (
        <label
          key={id}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent"
        >
          <Checkbox
            checked={picked.has(id)}
            onCheckedChange={(checked) => {
              const next = new Set(picked)
              if (checked) {
                next.add(id)
              } else {
                next.delete(id)
              }
              onChange(next)
            }}
          />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {trailing}
        </label>
      ))}
    </div>
  )
}
