import type { StepStatus } from '../../stores/run-overlay-store'
import { RunCard } from './parts/run-card'
import { RunCanvasPreview } from './run-canvas-preview'

interface RunPathCardProps {
  ir: string | null
  nodeStatuses: Record<string, StepStatus> | undefined
  whereabouts: string
}

/** The graph as this run took it (26a, D-26-1): the real canvas, coloured by its steps. */
export function RunPathCard({ ir, nodeStatuses, whereabouts }: RunPathCardProps) {
  return (
    <RunCard title="Path" meta={whereabouts} className="min-h-[420px] lg:h-full">
      {ir ? (
        <div className="min-h-[380px] flex-1">
          <RunCanvasPreview ir={ir} nodeStatuses={nodeStatuses} />
        </div>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          The version this run used was deleted, so there’s no graph to show.
        </p>
      )}
    </RunCard>
  )
}
