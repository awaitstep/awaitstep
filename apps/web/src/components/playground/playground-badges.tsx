const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400',
  POST: 'bg-blue-500/15 text-blue-400',
  PATCH: 'bg-amber-500/15 text-amber-400',
  DELETE: 'bg-red-500/15 text-red-400',
}

const SCOPE_COLORS: Record<string, string> = {
  read: 'bg-emerald-500/15 text-emerald-400',
  write: 'bg-blue-500/15 text-blue-400',
  deploy: 'bg-purple-500/15 text-purple-400',
}

export function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-bold ${METHOD_COLORS[method] ?? ''}`}>
      {method}
    </span>
  )
}

export function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${SCOPE_COLORS[scope] ?? ''}`}>
      {scope}
    </span>
  )
}

export function StatusBadge({ status }: { status: number }) {
  const color = status < 300 ? 'bg-emerald-500/15 text-emerald-400' : status < 500 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${color}`}>{status}</span>
}
