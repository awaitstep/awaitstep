import { createContext, useContext, useDeferredValue, useMemo, type ReactNode } from 'react'
import type { StepManifest } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'
import { useShallow } from 'zustand/react/shallow'
import type { VersionSummary } from '../../lib/api-client'
import { buildStepMap, type StepMap } from '../../lib/ide/step-map'
import { orderSteps, type StepRow } from '../../lib/ide/step-order'
import { useWorkflowStore } from '../../stores/workflow-store'

export interface StepSyncValue {
  workflowId: string
  /** The version the editor URL names, carried to the canvas so it opens the same one. */
  linkVersion: string | undefined
  /** A script has no manifest, so no step has a file. */
  kind: 'workflow' | 'script'
  map: StepMap
  rows: readonly StepRow[]
  /** The graph's nodes by id. */
  nodes: ReadonlyMap<string, WorkflowNode>
  /** The graph's edges, for the create action's placement choices. */
  edges: readonly StepSyncEdge[]
  versions: readonly VersionSummary[]
  /** The file that holds the run body, where steps with no file of their own are written. */
  workflowFile: string | null
  /** The version the graph is drawn from. */
  graphVersionId: string | null
  /** The version the open files came from. */
  codeVersionId: string | null
  /** False for a workflow nobody has saved on the canvas: there is no graph to show yet. */
  hasVersion: boolean
}

export interface StepSyncEdge {
  id: string
  source: string
  target: string
  label?: string
}

const StepSyncContext = createContext<StepSyncValue | null>(null)

interface ProviderProps {
  workflowId: string
  linkVersion: string | undefined
  kind: 'workflow' | 'script'
  manifest: StepManifest | null
  /** Every file as the editor has it, drafts included. */
  files: ReadonlyMap<string, { source: string }>
  projectPaths: ReadonlySet<string>
  /**
   * Node → its editable `steps/<id>.ts`, for the nodes the workspace shows
   * one for (`useWorkspaceData.stepSourceByNode`). A step whose path a stored
   * file or another step holds is absent, so its module is what opens.
   */
  sourcePaths: ReadonlyMap<string, string>
  workflowFile: string | null
  versions: readonly VersionSummary[]
  graphVersionId: string | null
  codeVersionId: string | null
  children: ReactNode
}

/**
 * The link between the graph and the files, built once for the whole
 * workspace: the Steps view, the preview and the inspector all read the same
 * map. Files are read deferred, so typing in the editor never waits on the
 * import scan.
 */
export function StepSyncProvider({
  workflowId,
  linkVersion,
  kind,
  manifest,
  files,
  projectPaths,
  sourcePaths,
  workflowFile,
  versions,
  graphVersionId,
  codeVersionId,
  children,
}: ProviderProps) {
  const { flowNodes, edges } = useWorkflowStore(
    useShallow((s) => ({ flowNodes: s.nodes, edges: s.edges })),
  )
  const deferredFiles = useDeferredValue(files)

  const nodes = useMemo(
    () => new Map(flowNodes.map((n) => [n.id, n.data.irNode as WorkflowNode])),
    [flowNodes],
  )
  const graphEdges = useMemo<readonly StepSyncEdge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(typeof e.label === 'string' && { label: e.label }),
      })),
    [edges],
  )
  const rows = useMemo(
    () =>
      orderSteps(
        flowNodes.map((n) => ({ id: n.id, type: n.data.irNode.type, position: n.position })),
        graphEdges,
      ),
    [flowNodes, graphEdges],
  )
  const map = useMemo(
    () =>
      buildStepMap({
        manifest,
        nodeIds: rows.map((r) => r.nodeId),
        files: deferredFiles,
        projectPaths,
        sourcePaths,
      }),
    [manifest, rows, deferredFiles, projectPaths, sourcePaths],
  )

  const value = useMemo<StepSyncValue>(
    () => ({
      workflowId,
      linkVersion,
      kind,
      map,
      rows,
      nodes,
      edges: graphEdges,
      workflowFile,
      versions,
      graphVersionId,
      codeVersionId,
      hasVersion: graphVersionId !== null,
    }),
    [
      workflowId,
      linkVersion,
      kind,
      map,
      rows,
      nodes,
      graphEdges,
      workflowFile,
      versions,
      graphVersionId,
      codeVersionId,
    ],
  )
  return <StepSyncContext.Provider value={value}>{children}</StepSyncContext.Provider>
}

export function useStepSync(): StepSyncValue {
  const value = useStepSyncOptional()
  if (!value) throw new Error('useStepSync must be used inside a StepSyncProvider')
  return value
}

/** The graph/files link, or null where a component is used outside the workspace (tests, stories). */
export function useStepSyncOptional(): StepSyncValue | null {
  return useContext(StepSyncContext)
}
