import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export function StatCard({
  icon: Icon,
  value,
  label,
  loading,
  variant,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: number
  label: string
  loading?: boolean
  variant?: 'warning'
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-2xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground/60" />
      ) : (
        <span
          className={cn(
            'mt-1 block font-mono text-xl font-semibold tabular-nums',
            variant === 'warning' && value > 0 && 'text-status-warning',
          )}
        >
          {value}
        </span>
      )}
    </div>
  )
}
