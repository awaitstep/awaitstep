import { CheckCircle2, XCircle } from 'lucide-react'
import { timeAgo } from '../../lib/time'

type Deployment = {
  id: string
  workflowId: string
  versionId: string
  connectionId: string | null
  serviceName: string
  serviceUrl: string | null
  status: string
  error: string | null
  createdAt: string
}

type Connection = {
  id: string
  name: string
}

export function DeploymentsList({
  deployments,
  connectionMap,
  onSelect,
}: {
  deployments: Deployment[]
  connectionMap: Map<string, Connection>
  onSelect: (deployment: Deployment) => void
}) {
  return (
    <div className="space-y-2">
      {deployments.map((d, i) => {
        const conn = d.connectionId ? connectionMap.get(d.connectionId) : undefined
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/20"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {d.status === 'success' ? (
                  <span className="flex items-center gap-1.5 text-xs text-status-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {i === 0 ? 'Latest' : 'Success'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-status-error">
                    <XCircle className="h-3.5 w-3.5" />
                    Failed
                  </span>
                )}
                <span className="font-mono text-xs text-foreground/70">{d.serviceName}</span>
                {conn && <span className="text-xs text-muted-foreground/50">{conn.name}</span>}
              </div>
              <div className="flex items-center gap-3">
                {d.serviceUrl && (
                  <span className="text-xs text-primary">
                    {d.serviceUrl.replace(/^https?:\/\//, '')}
                  </span>
                )}
                {d.error && !d.serviceUrl && (
                  <span className="text-xs text-status-error/60 truncate max-w-[200px]">
                    {d.error}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{timeAgo(d.createdAt)}</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
