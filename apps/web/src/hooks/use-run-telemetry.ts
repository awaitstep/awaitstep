import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import type { RunStep, RunSummary } from '../lib/api-client'
import {
  buildRunTimeline,
  graphShapeOf,
  isTerminalRunStatus,
  mapRunStepsToNodeStatuses,
  type RunGraphShape,
} from '../lib/run-steps'
import { buildStepList, type StepListEntry } from '../lib/run-step-list'
import type { StepStatus } from '../stores/run-overlay-store'
import { useApi } from '../contexts/api-client-context'
import { useRunStream } from './use-run-stream'

const NO_STEPS: RunStep[] = []
const NO_COALESCED: Record<string, string> = {}

export interface RunTelemetry {
  /** The run's version's graph, as text for the canvas; null until read, or when it was deleted. */
  ir: string | null
  steps: RunStep[]
  /** Whether the steps have been read at least once. */
  stepsLoaded: boolean
  /** Per-node status for the canvas; undefined until the steps are in. */
  nodeStatuses: Record<string, StepStatus> | undefined
  entries: StepListEntry[]
  /** The time axis the step bars share. */
  spanMs: number
}

/**
 * A run's version graph and its steps, live while it runs: the stream writes
 * through and the steps poll as the floor. Shared by the Path card and the
 * Steps card so they read one copy.
 */
export function useRunTelemetry(workflowId: string, run: RunSummary): RunTelemetry {
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
  const steps = stepsResponse?.data ?? NO_STEPS
  const coalescedInto = stepsResponse?.coalescedInto ?? NO_COALESCED

  const graph = useMemo(() => {
    if (!version) return null
    try {
      return JSON.parse(version.ir) as { nodes: WorkflowNode[]; edges: IREdge[] }
    } catch {
      return null
    }
  }, [version])
  const shape = useMemo<RunGraphShape | null>(() => (graph ? graphShapeOf(graph) : null), [graph])

  const nodeStatuses = useMemo(() => {
    // Only what the provider reported: no overlay until the steps are in, and a run that
    // reported none (it never started, or its records are gone) colours nothing — a guess
    // from the graph would paint paths that never ran.
    if (!graph || !shape || !stepsResponse) return undefined
    return mapRunStepsToNodeStatuses(
      graph.nodes.map((n) => n.id),
      steps,
      coalescedInto,
      run.status,
      shape,
    )
  }, [graph, shape, stepsResponse, steps, coalescedInto, run.status])

  const endedAt = isActive ? null : run.updatedAt
  const { entries, spanMs } = useMemo(() => {
    const timeline = buildRunTimeline(steps, { status: run.status, endedAt })
    const list = buildStepList({
      rows: timeline.rows,
      steps,
      runStatus: run.status,
      nodeNames: Object.fromEntries((graph?.nodes ?? []).map((n) => [n.id, n.name])),
      containment: shape?.containment ?? new Map(),
      types: shape?.types ?? new Map(),
    })
    return { entries: list, spanMs: timeline.spanMs }
  }, [steps, run.status, endedAt, graph, shape])

  return {
    ir: version?.ir ?? null,
    steps,
    stepsLoaded: Boolean(stepsResponse),
    nodeStatuses,
    entries,
    spanMs,
  }
}
