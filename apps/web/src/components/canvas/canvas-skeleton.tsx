function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted/40 ${className ?? ''}`} />
}

function GhostNode({ className }: { className?: string }) {
  return (
    <div
      className={`absolute rounded-lg border border-border/40 bg-card/60 shadow-sm ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
        <Bone className="h-3 w-3 rounded-full" />
        <Bone className="h-3 w-16" />
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <Bone className="h-2.5 w-24 bg-muted/25" />
        <Bone className="h-2.5 w-16 bg-muted/20" />
      </div>
    </div>
  )
}

export function CanvasSkeleton() {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      {/* Toolbar skeleton */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <Bone className="h-8 w-8 rounded-md" />
          <div className="h-5 w-px bg-muted/70" />
          <Bone className="h-4 w-32" />
          <Bone className="h-4 w-12 bg-muted/25" />
        </div>
        <div className="flex items-center gap-1.5">
          <Bone className="h-8 w-16 rounded-md" />
          <Bone className="h-8 w-20 rounded-md" />
          <Bone className="h-8 w-18 rounded-md" />
          <div className="h-5 w-px bg-muted/70" />
          <Bone className="h-8 w-14 rounded-md" />
          <Bone className="h-8 w-20 rounded-md bg-primary/20" />
        </div>
      </header>

      {/* Canvas area with dot grid and ghost nodes */}
      <div className="relative flex-1 overflow-hidden">
        {/* Dot grid background */}
        <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="skeleton-dots"
              x="0"
              y="0"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.8" className="fill-muted/30" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#skeleton-dots)" />
        </svg>

        {/* Ghost nodes */}
        <GhostNode className="left-[20%] top-[25%] w-44" />
        <GhostNode className="left-[45%] top-[18%] w-48" />
        <GhostNode className="left-[38%] top-[50%] w-44" />

        {/* Ghost edges (simple lines between nodes) */}
        <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <line
            x1="29%"
            y1="32%"
            x2="45%"
            y2="25%"
            className="stroke-border/30"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1="52%"
            y1="28%"
            x2="48%"
            y2="50%"
            className="stroke-border/30"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        </svg>

        {/* Node palette skeleton */}
        <div className="absolute left-4 top-4 z-10">
          <Bone className="h-9 w-9 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
