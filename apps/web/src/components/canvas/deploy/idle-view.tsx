import { Link } from '@tanstack/react-router'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Button } from '../../ui/button'
import { Select } from '../../ui/select'
import { formatShortDate } from '../../../lib/time'

interface Connection {
  id: string
  name: string
  credentials: Record<string, string>
}

interface DeploymentSummary {
  id: string
  serviceName: string
  status: string
  createdAt: string
}

interface IdleViewProps {
  connections: Connection[] | undefined
  connectionId: string
  onConnectionChange: (id: string) => void
  deployments: DeploymentSummary[] | undefined
  onDeploy: () => void
  onClose: () => void
}

export function IdleView({
  connections,
  connectionId,
  onConnectionChange,
  deployments,
  onDeploy,
  onClose,
}: IdleViewProps) {
  return (
    <div className="mt-4 space-y-4">
      {connections && connections.length > 0 ? (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Connection</label>
          <Select
            value={connectionId}
            onValueChange={onConnectionChange}
            options={connections.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.credentials.accountId ?? ''})`,
            }))}
            className="w-full"
          />
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
          <p className="text-xs text-muted-foreground">
            No connections found.{' '}
            <Link to="/connections" className="text-primary hover:underline" onClick={onClose}>
              Add one
            </Link>{' '}
            to deploy.
          </p>
        </div>
      )}
      {deployments && deployments.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Recent deployments</span>
          </div>
          <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {deployments.slice(0, 5).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  {d.status === 'success' ? (
                    <CheckCircle2 className="h-3 w-3 text-status-success" />
                  ) : (
                    <XCircle className="h-3 w-3 text-status-error" />
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {d.serviceName}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground/60">
                  {formatShortDate(d.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={!connectionId} onClick={onDeploy}>
          Deploy
        </Button>
      </div>
    </div>
  )
}
