import { cn } from '../../lib/utils'
import type { SuperCategoryMeta } from '../../lib/node-categories'

interface CategoryFilterProps {
  categories: (SuperCategoryMeta & { count: number })[]
  active: string | null
  onChange: (key: string | null) => void
}

export function CategoryFilterSidebar({ categories, active, onChange }: CategoryFilterProps) {
  const total = categories.reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="flex flex-col gap-0.5">
      <button
        onClick={() => onChange(null)}
        className={cn(
          'flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors',
          active === null
            ? 'bg-muted/80 font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        )}
      >
        <span>All</span>
        <span className="text-xs tabular-nums text-muted-foreground/60">{total}</span>
      </button>
      {categories.map((cat) => {
        const Icon = cat.icon
        const isActive = active === cat.key
        return (
          <button
            key={cat.key}
            onClick={() => onChange(isActive ? null : cat.key)}
            className={cn(
              'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
              isActive
                ? 'bg-muted/80 font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{cat.label}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
              {cat.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
