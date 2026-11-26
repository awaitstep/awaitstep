import type { CSSProperties } from 'react'
import { Bone } from '../ui/skeletons'
import { CANVAS_GRID } from '../../lib/canvas/place-beside'
import { NODE_WIDTH } from '../../lib/canvas/node-sides'

// The ghost graph is laid out in canvas pixels so its links meet its nodes
// exactly: three nodes in a row, a grid-aligned gap apart, joined by plain lines.
const GHOST_HEIGHT = 74
const GHOST_GAP = 80
const GRAPH_HEIGHT = GHOST_HEIGHT

const GHOSTS = [
  { name: 'w-20', kind: 'w-12', config: 'w-28' },
  { name: 'w-24', kind: 'w-10', config: 'w-32' },
  { name: 'w-16', kind: 'w-14', config: 'w-24' },
].map((ghost, i) => ({ ...ghost, x: i * (NODE_WIDTH + GHOST_GAP), y: 0 }))

const GRAPH_WIDTH = GHOSTS.length * NODE_WIDTH + (GHOSTS.length - 1) * GHOST_GAP
const LINK_Y = GHOST_HEIGHT / 2

function GhostNode({ ghost, index }: { ghost: (typeof GHOSTS)[number]; index: number }) {
  // Each node pulses a beat after the one before it, so loading reads as flow.
  const delay: CSSProperties = { animationDelay: `${index * 150}ms` }
  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-[12px] border border-border bg-card"
      style={{ left: ghost.x, top: ghost.y, width: NODE_WIDTH, height: GHOST_HEIGHT }}
    >
      <span
        aria-hidden
        className="absolute bottom-[9px] left-0 top-[9px] w-[2px] rounded-full bg-muted/60"
      />
      <div className="flex h-[42px] items-center gap-2 pl-3 pr-2.5">
        <Bone style={delay} className="h-6 w-6 shrink-0 rounded-[7px]" />
        <div className="flex flex-col gap-1.5">
          <Bone style={delay} className={`h-3 ${ghost.name}`} />
          <Bone style={delay} className={`h-2 ${ghost.kind} bg-muted/25`} />
        </div>
      </div>
      <div className="flex flex-1 items-center border-t border-border/60 pl-3 pr-2.5">
        <Bone style={delay} className={`h-2 ${ghost.config} bg-muted/20`} />
      </div>
    </div>
  )
}

function TopBarSkeleton() {
  return (
    <header className="z-20 grid h-14 shrink-0 grid-cols-[minmax(2.5rem,1fr)_auto_minmax(max-content,1fr)] items-center gap-2 border-b border-border bg-card px-4">
      <div className="flex items-center gap-2">
        <Bone className="h-8 w-8 rounded-md" />
        <div className="h-5 w-px bg-muted/70" />
        <Bone className="h-4 w-32" />
        <Bone className="h-4 w-14 bg-muted/25" />
      </div>
      <Bone className="h-8 w-36 rounded-md" />
      <div className="flex items-center justify-end gap-1.5">
        <Bone className="h-8 w-8 rounded-md bg-muted/25" />
        <Bone className="h-8 w-8 rounded-md bg-muted/25" />
        <Bone className="h-8 w-8 rounded-md bg-muted/25" />
        <div className="h-5 w-px bg-muted/70" />
        <Bone className="h-8 w-16 rounded-md" />
        <Bone className="h-8 w-8 rounded-md" />
        <Bone className="h-8 w-[5.5rem] rounded-md bg-primary-ink/20" />
      </div>
    </header>
  )
}

export function CanvasSkeleton() {
  return (
    <div role="status" className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <span className="sr-only">Loading workflow</span>
      <div aria-hidden="true" className="contents">
        <TopBarSkeleton />

        <div className="relative flex-1 overflow-hidden">
          {/* The canvas's own dot grid: same spacing, colour and strength. */}
          <svg className="absolute inset-0 h-full w-full opacity-30">
            <defs>
              <pattern
                id="canvas-skeleton-dots"
                width={CANVAS_GRID}
                height={CANVAS_GRID}
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r="1" fill="var(--muted-foreground)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#canvas-skeleton-dots)" />
          </svg>

          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}
          >
            <svg
              className="absolute inset-0 animate-pulse overflow-visible motion-reduce:animate-none"
              width={GRAPH_WIDTH}
              height={GRAPH_HEIGHT}
            >
              {GHOSTS.slice(1).map((ghost, i) => (
                <line
                  key={i}
                  x1={GHOSTS[i].x + NODE_WIDTH}
                  y1={LINK_Y}
                  x2={ghost.x}
                  y2={LINK_Y}
                  stroke="var(--border)"
                  strokeWidth={1.5}
                />
              ))}
            </svg>
            {GHOSTS.map((ghost, i) => (
              <GhostNode key={i} ghost={ghost} index={i} />
            ))}
          </div>

          {/* The + palette button, then React Flow's controls and minimap. */}
          <Bone className="absolute left-4 top-4 h-9 w-9 rounded-lg" />
          <Bone className="absolute bottom-4 left-4 h-[92px] w-7 rounded-lg bg-muted/25" />
          <Bone className="absolute bottom-4 right-4 h-[120px] w-[200px] rounded-lg bg-muted/20" />
        </div>
      </div>
    </div>
  )
}
