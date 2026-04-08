import { Link } from '@tanstack/react-router'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn } from '../../../lib/utils'
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
  previewUrls: boolean
  onPreviewUrlsChange: (v: boolean) => void
  workersDev: boolean
  onWorkersDevChange: (v: boolean) => void
  onDeploy: () => void
  onClose: () => void
}

export function IdleView({
  connections,
  connectionId,
  onConnectionChange,
  deployments,
  previewUrls,
  onPreviewUrlsChange,
  workersDev,
  onWorkersDevChange,
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
      {connectionId && (
        <div className="space-y-2">
          <ToggleRow
            label="Preview URLs"
            description="Enable preview URLs for this deployment."
            checked={previewUrls}
            onChange={onPreviewUrlsChange}
          />
          <ToggleRow
            label="workers.dev Route"
            description="Expose the worker on a workers.dev subdomain."
            checked={workersDev}
            onChange={onWorkersDevChange}
          />
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
                  <span className="font-mono text-xs text-muted-foreground">{d.serviceName}</span>
                </div>
                <span className="text-xs text-muted-foreground/60">
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

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <span className="text-xs text-foreground">{label}</span>
        <p className="text-xs text-muted-foreground/60">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}
