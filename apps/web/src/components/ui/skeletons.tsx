function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted/40 ${className ?? ''}`} />
}

export function ListRowSkeleton() {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <Bone className="h-4 w-32" />
            <Bone className="h-4 w-16 bg-muted/25" />
          </div>
          <Bone className="h-3 w-48 bg-muted/20" />
        </div>
        <Bone className="h-3 w-12 bg-muted/25" />
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6 pt-2">
      <div className="space-y-3">
        <Bone className="h-5 w-48" />
        <Bone className="h-3 w-72 bg-muted/25" />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Bone className="h-3 w-20 bg-muted/25" />
          <Bone className="h-4 w-36" />
        </div>
        <div className="space-y-2">
          <Bone className="h-3 w-24 bg-muted/25" />
          <Bone className="h-4 w-28" />
        </div>
      </div>
      <Bone className="h-px w-full bg-border" />
      <div className="space-y-3">
        <Bone className="h-4 w-32" />
        <Bone className="h-20 w-full rounded-lg bg-muted/20" />
      </div>
    </div>
  )
}
