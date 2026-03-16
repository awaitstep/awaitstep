import { cn } from '../../lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  running: { label: 'Running', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  paused: { label: 'Paused', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  complete: { label: 'Complete', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  errored: { label: 'Errored', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  terminated: { label: 'Terminated', className: 'bg-red-500/10 text-red-300 border-red-500/20' },
  waiting: { label: 'Waiting', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  unknown: { label: 'Unknown', className: 'bg-white/[0.04] text-white/40 border-white/[0.08]' },
}

interface RunStatusBadgeProps {
  status: string
  className?: string
}

export function RunStatusBadge({ status, className }: RunStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown!
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        config.className,
        className,
      )}
    >
      {(status === 'running' || status === 'queued') && (
        <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {config.label}
    </span>
  )
}
