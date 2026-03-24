export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6 py-2">
      <div className="h-5 w-40 rounded bg-muted/50" />
      <div className="space-y-3">
        <div className="h-3 w-full max-w-md rounded bg-muted/30" />
        <div className="h-3 w-full max-w-sm rounded bg-muted/20" />
      </div>
    </div>
  )
}
