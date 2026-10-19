import { Bone } from '../ui/skeletons'

export function IdeSkeleton() {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <Bone className="h-8 w-8 rounded-md" />
          <div className="h-5 w-px bg-muted/70" />
          <Bone className="h-4 w-32" />
          <Bone className="h-4 w-10 bg-muted/25" />
        </div>
        <Bone className="h-8 w-36 rounded-md" />
        <div className="flex items-center gap-1.5">
          <Bone className="h-8 w-8 rounded-md" />
          <Bone className="h-8 w-8 rounded-md" />
          <Bone className="h-8 w-8 rounded-md" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[220px] shrink-0 border-r border-border bg-card p-3">
          <Bone className="mb-3 h-3 w-16 bg-muted/25" />
          <div className="space-y-2">
            <Bone className="h-3 w-24" />
            <Bone className="ml-4 h-3 w-28 bg-muted/30" />
            <Bone className="ml-4 h-3 w-20 bg-muted/30" />
            <Bone className="h-3 w-20" />
            <Bone className="h-3 w-24" />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
            <Bone className="h-6 w-28 rounded-md" />
            <Bone className="h-6 w-24 rounded-md bg-muted/25" />
          </div>
          <div className="flex-1 bg-editor p-4">
            <div className="space-y-2.5">
              <Bone className="h-2.5 w-2/5 bg-muted/25" />
              <Bone className="h-2.5 w-3/5 bg-muted/20" />
              <Bone className="h-2.5 w-1/3 bg-muted/20" />
              <Bone className="h-2.5 w-1/2 bg-muted/25" />
              <Bone className="h-2.5 w-2/5 bg-muted/20" />
            </div>
          </div>
          <div className="h-[28%] shrink-0 border-t border-border bg-card">
            <div className="flex h-9 items-center gap-3 border-b border-border px-3">
              <Bone className="h-3 w-16" />
              <Bone className="h-3 w-12 bg-muted/25" />
              <Bone className="h-3 w-10 bg-muted/25" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
