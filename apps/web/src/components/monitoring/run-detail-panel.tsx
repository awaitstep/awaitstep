import { Clock, AlertCircle, CheckCircle2, Pause, Play, Square } from 'lucide-react'
import { Button } from '../ui/button'
import { RunStatusBadge } from './run-status-badge'

interface RunDetailPanelProps {
  run: {
    id: string
    instanceId: string
    status: string
    output?: string
    error?: string
    createdAt: string
  }
  onPause?: () => void
  onResume?: () => void
  onTerminate?: () => void
}

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])

export function RunDetailPanel({ run, onPause, onResume, onTerminate }: RunDetailPanelProps) {
  const isTerminal = TERMINAL_STATUSES.has(run.status)
  const isPaused = run.status === 'paused'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RunStatusBadge status={run.status} />
          <span className="text-xs text-white/30 font-mono">{run.instanceId}</span>
        </div>
        {!isTerminal && (
          <div className="flex items-center gap-1">
            {isPaused ? (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/40" onClick={onResume}>
                <Play className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/40" onClick={onPause}>
                <Pause className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400/60 hover:text-red-400" onClick={onTerminate}>
              <Square className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-white/40">
        <Clock className="h-3 w-3" />
        <span>Started {new Date(run.createdAt).toLocaleString()}</span>
      </div>

      {run.output && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-emerald-400/80">
            <CheckCircle2 className="h-3 w-3" />
            <span>Output</span>
          </div>
          <pre className="overflow-auto rounded-lg bg-white/[0.03] p-3 text-xs text-white/70 font-mono border border-white/[0.06]">
            {typeof run.output === 'string' ? run.output : JSON.stringify(run.output, null, 2)}
          </pre>
        </div>
      )}

      {run.error && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-red-400/80">
            <AlertCircle className="h-3 w-3" />
            <span>Error</span>
          </div>
          <pre className="overflow-auto rounded-lg bg-red-500/5 p-3 text-xs text-red-300 font-mono border border-red-500/10">
            {typeof run.error === 'string' ? run.error : JSON.stringify(run.error, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
