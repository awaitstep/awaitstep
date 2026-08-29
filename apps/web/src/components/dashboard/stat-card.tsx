import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export function StatCard({
  icon: Icon,
  value,
  label,
  loading,
  to,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: number
  label: string
  loading?: boolean
  /** Destination when the cell is clicked — every stat doubles as navigation. */
  to: string
  tone?: 'warning' | 'error'
}) {
  return (
    <Link to={to} className="group block px-4 py-3 transition-colors hover:bg-muted/20">
      <div className="flex items-center justify-between text-muted-foreground">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-2xs font-medium uppercase tracking-wider">{label}</span>
        </div>
        <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
      </div>
      {loading ? (
        <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground/60" />
      ) : (
        <span
          className={cn(
            'mt-1 block font-mono text-xl font-semibold tabular-nums',
            tone === 'warning' && value > 0 && 'text-status-warning',
            tone === 'error' && value > 0 && 'text-status-error',
          )}
        >
          {value}
        </span>
      )}
    </Link>
  )
}
