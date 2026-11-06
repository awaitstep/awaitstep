import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import { type RunSummary } from '../../lib/api-client'
import { computeStepStatuses } from '../../lib/compute-step-statuses'
import { isTerminalRunStatus, mapRunStepsToNodeStatuses } from '../../lib/run-steps'
import { RunCanvasPreview } from './run-canvas-preview'
import { RunTimeline } from './run-timeline'
import { useRunStream } from '../../hooks/use-run-stream'
import { useApi } from '../../contexts/api-client-context'

const EMPTY_STEPS = { data: [], coalescedInto: {} }

interface RunTelemetryProps {
  workflowId: string
  run: RunSummary
}

/**
 * The run's graph with live per-node status plus the step timeline. Status
 * comes from F8 telemetry when the provider has reported steps; before any
 * record exists (or for pre-telemetry runs) the topological heuristic keeps
 * the overlay meaningful.
 */
export function RunTelemetry({ workflowId, run }: RunTelemetryProps) {
  const api = useApi()
  const queryClient = useQueryClient()
  const isActive = !isTerminalRunStatus(run.status)
  useRunStream({ workflowId, runId: run.id, enabled: isActive })

  // The run and steps queries poll independently; when the run flips to
  // terminal, its polling stops but the last steps snapshot may predate the
  // sync tick that finalized the rows. One final refetch closes the gap.
  const wasActive = useRef(isActive)
  useEffect(() => {
    if (wasActive.current && !isActive) {
      void queryClient.invalidateQueries({ queryKey: ['workflow-run-steps', workflowId, run.id] })
    }
    wasActive.current = isActive
  }, [isActive, queryClient, workflowId, run.id])

  const { data: version } = useQuery({
    queryKey: ['workflow-version', workflowId, run.versionId],
    queryFn: () => api.getVersion(workflowId, run.versionId ?? ''),
    // Versions are immutable once a run references them; a run whose version
    // was deleted (FK set-null) has nothing to draw.
    enabled: Boolean(run.versionId),
    staleTime: Infinity,
  })

  const { data: stepsResponse } = useQuery({
    queryKey: ['workflow-run-steps', workflowId, run.id],
    queryFn: () => api.getWorkflowRunSteps(workflowId, run.id),
    refetchInterval: isActive ? 5_000 : false,
  })
  const { data: steps, coalescedInto } = stepsResponse ?? EMPTY_STEPS

  const graph = useMemo(() => {
    if (!version) return null
    try {
      const parsed = JSON.parse(version.ir) as {
        nodes: WorkflowNode[]
        edges: IREdge[]
        entryNodeId?: string
      }
      return parsed
    } catch {
      return null
    }
  }, [version])

  const nodeStatuses = useMemo(() => {
    // No overlay until the steps query has resolved: painting the heuristic
    // first and telemetry second would visibly recolor the graph.
    if (!graph || !stepsResponse) return undefined
    if (steps.length > 0) {
      return mapRunStepsToNodeStatuses(
        graph.nodes.map((n) => n.id),
        steps,
        coalescedInto,
        run.status,
      )
    }
    // Resolved empty: a run from before step telemetry existed. The
    // topological heuristic is the only signal left.
    const entry = graph.entryNodeId ?? graph.nodes[0]?.id
    return entry ? computeStepStatuses(graph.nodes, graph.edges, entry, run.status) : undefined
  }, [graph, stepsResponse, steps, coalescedInto, run.status])

  const nodeNames = useMemo(
    () => Object.fromEntries((graph?.nodes ?? []).map((n) => [n.id, n.name])),
    [graph],
  )

  return (
    <div className="mt-8 space-y-4">
      {version && (
        <div className="h-[320px] overflow-hidden rounded-md border border-border">
          <RunCanvasPreview ir={version.ir} nodeStatuses={nodeStatuses} />
        </div>
      )}
      <RunTimeline
        steps={steps}
        run={{ status: run.status, endedAt: isActive ? null : run.updatedAt }}
        nodeNames={nodeNames}
      />
    </div>
  )
}
