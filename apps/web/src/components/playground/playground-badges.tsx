const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-status-success/15 text-status-success',
  POST: 'bg-status-info/15 text-status-info',
  PUT: 'bg-status-warning/15 text-status-warning',
  PATCH: 'bg-status-warning/15 text-status-warning',
  DELETE: 'bg-status-error/15 text-status-error',
}

const ACTION_COLORS: Record<string, string> = {
  read: 'bg-status-success/15 text-status-success',
  write: 'bg-status-info/15 text-status-info',
  delete: 'bg-status-error/15 text-status-error',
  deploy: 'bg-node-flow/15 text-node-flow',
  run: 'bg-node-flow/15 text-node-flow',
}

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-bold ${METHOD_COLORS[method] ?? ''}`}
    >
      {method}
    </span>
  )
}

function Cell({ permission, title }: { permission: string; title?: string }) {
  const action = permission.split(':')[1] ?? ''
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-xs font-medium ${ACTION_COLORS[action] ?? ''}`}
    >
      {permission}
    </span>
  )
}

/**
 * The `resource:action` cell a key needs for the call, coloured by the
 * action — and, where a project or workspace key reaches an organization
 * resource through its own grid, that cell beside it.
 */
export function PermissionBadge({
  permission,
  belowPermission,
}: {
  permission: string
  belowPermission?: string
}) {
  if (!belowPermission) return <Cell permission={permission} />
  return (
    <span className="inline-flex items-center gap-1">
      <Cell permission={permission} title="Organization keys" />
      <span className="text-xs text-muted-foreground">·</span>
      <Cell permission={belowPermission} title="Project and workspace keys" />
    </span>
  )
}

export function StatusBadge({ status }: { status: number }) {
  const color =
    status < 300
      ? 'bg-status-success/15 text-status-success'
      : status < 500
        ? 'bg-status-warning/15 text-status-warning'
        : 'bg-status-error/15 text-status-error'
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${color}`}>
      {status}
    </span>
  )
}
