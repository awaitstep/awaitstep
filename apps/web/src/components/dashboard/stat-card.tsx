import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export function StatCard({
  icon: Icon,
  value,
  label,
  sub,
  loading,
  to,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: number
  label: string
  /** Secondary context line under the value, e.g. "of 8 total". */
  sub?: string
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
        <div className="mt-2 flex h-12 items-start">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
        </div>
      ) : (
        <>
          <span
            className={cn(
              'mt-1 block font-mono text-2xl font-semibold tabular-nums',
              tone === 'warning' && value > 0 && 'text-status-warning',
              tone === 'error' && value > 0 && 'text-status-error',
            )}
          >
            {value}
          </span>
          {sub && <span className="mt-0.5 block text-2xs text-muted-foreground/60">{sub}</span>}
        </>
      )}
    </Link>
  )
}
