import { ExternalLink, Globe, XCircle, Loader2 } from 'lucide-react'
import type { DeploymentSummary } from '../../lib/api-client'
import { formatDate } from '../../lib/time'

interface DeploymentCardProps {
  deployment: DeploymentSummary
}

export function DeploymentCard({ deployment }: DeploymentCardProps) {
  const isSuccess = deployment.status === 'success'
  const isFailed = deployment.status === 'failed'

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isSuccess
              ? 'bg-status-success/10'
              : isFailed
                ? 'bg-status-error/10'
                : 'bg-status-info/10'
          }`}
        >
          {isSuccess ? (
            <Globe className="h-4 w-4 text-status-success" />
          ) : isFailed ? (
            <XCircle className="h-4 w-4 text-status-error" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-status-info" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {isSuccess ? 'Live' : isFailed ? 'Failed' : 'Deploying'}
            </span>
            <span className="text-xs text-muted-foreground/50">
              {formatDate(deployment.createdAt)}
            </span>
          </div>
          {deployment.serviceUrl && (
            <a
              href={deployment.serviceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {deployment.serviceUrl.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      </div>
      {deployment.error && (
        <p className="mt-3 rounded bg-status-error/10 px-3 py-2 text-xs text-status-error">
          {deployment.error}
        </p>
      )}
    </div>
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
      <span className="inline-flex items-center gap-1 rounded bg-status-warning/10 px-1.5 py-0.5 text-xs font-medium text-status-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
        Deployed v{deployedVersion ?? '?'} (outdated)
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded bg-status-success/10 px-1.5 py-0.5 text-xs font-medium text-status-success">
      <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
      Deployed v{deployedVersion ?? '?'}
    </span>
  )
}
