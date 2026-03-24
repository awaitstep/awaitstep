import { Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

const STAGES = [
  { key: 'INITIALIZING', label: 'Initializing' },
  { key: 'GENERATING_CODE', label: 'Compiling code' },
  { key: 'CODE_READY', label: 'Code ready' },
  { key: 'DETECTING_BINDINGS', label: 'Detecting bindings' },
  { key: 'BINDINGS_READY', label: 'Bindings configured' },
  { key: 'CREATING_WORKER', label: 'Creating worker' },
  { key: 'DEPLOYING', label: 'Deploying' },
  { key: 'WORKER_DEPLOYED', label: 'Worker deployed' },
  { key: 'UPDATING_WORKFLOW', label: 'Updating workflow' },
  { key: 'COMPLETED', label: 'Completed' },
]

interface DeployingViewProps {
  progress: { stage: string; progress: number } | null
}

export function DeployingView({ progress }: DeployingViewProps) {
  return (
    <div className="mt-4 space-y-3">
      {STAGES.map((stage) => {
        const isActive = progress?.stage === stage.key
        const isPast =
          progress &&
          STAGES.findIndex((s) => s.key === progress.stage) >
            STAGES.findIndex((s) => s.key === stage.key)
        return (
          <div
            key={stage.key}
            className={cn(
              'flex items-center gap-2 text-sm',
              isActive
                ? 'text-foreground'
                : isPast
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/40',
            )}
          >
            {isActive ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : isPast ? (
              <CheckCircle2 className="h-4 w-4 text-status-success" />
            ) : (
              <div className="h-4 w-4 rounded-full border border-border" />
            )}
            {stage.label}
          </div>
        )
      })}
      {progress && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
