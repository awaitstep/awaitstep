import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted/60">
        <Icon className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <h3 className="mt-4 text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
