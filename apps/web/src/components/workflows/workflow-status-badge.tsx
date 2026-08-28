export function WorkflowStatusBadge({
  hasVersion,
  deployStatus,
  isOutdated,
}: {
  hasVersion: boolean
  deployStatus?: string
  isOutdated?: boolean
}) {
  if (deployStatus === 'deploying' || deployStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-info">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-info" />
        Deploying
      </span>
    )
  }

  if (hasVersion && deployStatus === 'success') {
    if (isOutdated) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-status-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
          Outdated
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-success">
        <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
        Deployed
      </span>
    )
  }

  if (deployStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-error">
        <span className="h-1.5 w-1.5 rounded-full bg-status-error" />
        Error
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
      <span className="h-1.5 w-1.5 rounded-full border border-border" />
      Draft
    </span>
  )
}
