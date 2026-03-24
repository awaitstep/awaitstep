import { ExternalLink } from 'lucide-react'
import type { DeploymentSummary } from '../../lib/api-client'
import { formatDate } from '../../lib/time'

interface DeploymentCardProps {
  deployment: DeploymentSummary
}

export function DeploymentCard({ deployment }: DeploymentCardProps) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-foreground/70">Latest Deployment</h2>
      <div className="mt-3 rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DeployStatusDot status={deployment.status} />
            <div>
              <p className="text-sm text-foreground/70">
                {deployment.status === 'success'
                  ? 'Deployed'
                  : deployment.status === 'failed'
                    ? 'Failed'
                    : 'Deploying'}
              </p>
              <p className="text-xs text-muted-foreground/60">{formatDate(deployment.createdAt)}</p>
            </div>
          </div>
        </div>
        {deployment.serviceUrl && (
          <div className="mt-2 flex items-center justify-end">
            <a
              href={deployment.serviceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-status-success hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {deployment.serviceUrl.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}
        {deployment.error && (
          <p className="mt-2 rounded bg-status-error/10 px-3 py-2 text-xs text-status-error">
            {deployment.error}
          </p>
        )}
      </div>
    </section>
  )
}

export function DeployStatusBadge({
  hasActiveDeployment,
  hasUndeployedChanges,
  deployedVersion,
}: {
  hasActiveDeployment: boolean
  hasUndeployedChanges: boolean
  deployedVersion?: number
}) {
  if (!hasActiveDeployment) return null

  if (hasUndeployedChanges) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
        Deployed v{deployedVersion ?? '?'} (outdated)
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded bg-status-success/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
      <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
      Deployed v{deployedVersion ?? '?'}
    </span>
  )
}

function DeployStatusDot({ status }: { status: string }) {
  const color =
    status === 'success'
      ? 'bg-status-success'
      : status === 'failed'
        ? 'bg-status-error'
        : 'bg-status-info animate-pulse'

  return <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
}
