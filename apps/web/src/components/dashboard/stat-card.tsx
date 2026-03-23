import { Loader2 } from 'lucide-react'

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
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground/60" />
      ) : (
        <span className={`mt-1 block text-xl font-semibold ${variant === 'warning' && value > 0 ? 'text-amber-400' : ''}`}>
          {value}
        </span>
      )}
    </div>
  )
}
