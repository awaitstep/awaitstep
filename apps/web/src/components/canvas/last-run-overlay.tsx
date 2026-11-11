import { useEffect, useMemo, useState } from 'react'
import { Panel } from '@xyflow/react'
import { History } from 'lucide-react'
import type { Edge as IREdge } from '@awaitstep/ir'
import { useLastRunSteps } from '../../hooks/use-last-run-steps'
import { graphShapeOf, mapRunStepsToNodeStatuses } from '../../lib/run-steps'
import { timeAgo } from '../../lib/time'
import { useRunOverlayStore } from '../../stores/run-overlay-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { Button } from '../ui/button'

/**
 * "Last run" on the editor canvas: while on, the canvas wears the latest
 * run's step statuses — green done, red failed, amber a wait that timed out,
 * blue running — with each branch, parallel, loop and try/catch taking its
 * children's. Off by default; nothing is fetched until it is turned on.
 */
export function LastRunOverlay({ workflowId }: { workflowId: string }) {
  const [on, setOn] = useState(false)
  const lastRun = useLastRunSteps(workflowId, on)
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const setOverlay = useRunOverlayStore((s) => s.setOverlay)
  const clearOverlay = useRunOverlayStore((s) => s.clearOverlay)

  // The run ran a deployed version; nodes added since simply show nothing.
  const statuses = useMemo(() => {
    if (!on || !lastRun.run) return null
    const graph = {
      nodes: nodes.map((n) => n.data.irNode),
      edges: edges.map((e): IREdge => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(typeof e.label === 'string' && { label: e.label }),
      })),
    }
    return mapRunStepsToNodeStatuses(
      graph.nodes.map((n) => n.id),
      lastRun.steps,
      lastRun.coalescedInto,
      lastRun.run.status,
      graphShapeOf(graph),
    )
  }, [on, lastRun.run, lastRun.steps, lastRun.coalescedInto, nodes, edges])

  // The overlay store is shared by every canvas: owned while this is on, and released after.
  useEffect(() => {
    if (statuses) setOverlay(statuses)
    else clearOverlay()
  }, [statuses, setOverlay, clearOverlay])
  useEffect(() => () => clearOverlay(), [clearOverlay])

  function handleToggle() {
    setOn((was) => !was)
  }

  let caption: string | null = null
  if (on && lastRun.loading) caption = 'Loading the last run…'
  else if (on && lastRun.failed) caption = 'Couldn’t load the last run'
  else if (on && !lastRun.run) caption = 'No runs yet'
  else if (on && lastRun.run) caption = `${lastRun.run.status} · ${timeAgo(lastRun.run.createdAt)}`

  return (
    <Panel position="top-right" className="flex items-center gap-2">
      {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      <Button
        type="button"
        variant={on ? 'secondary' : 'outline'}
        size="sm"
        aria-pressed={on}
        title="Colour the canvas by the latest run"
        onClick={handleToggle}
        className="gap-1.5 bg-card"
      >
        <History aria-hidden="true" className="size-3.5" />
        Last run
      </Button>
    </Panel>
  )
}
