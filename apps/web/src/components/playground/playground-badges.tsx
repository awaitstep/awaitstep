const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-status-success/15 text-status-success',
  POST: 'bg-status-info/15 text-status-info',
  PATCH: 'bg-status-warning/15 text-status-warning',
  DELETE: 'bg-status-error/15 text-status-error',
}

const SCOPE_COLORS: Record<string, string> = {
  read: 'bg-status-success/15 text-status-success',
  write: 'bg-status-info/15 text-status-info',
  deploy: 'bg-node-flow/15 text-node-flow',
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

export function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${SCOPE_COLORS[scope] ?? ''}`}
    >
      {scope}
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
