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
  versions: readonly VersionSummary[]
  /** The file that holds the run body, where steps with no file of their own are written. */
  workflowFile: string | null
  /** The version the graph is drawn from. */
  graphVersionId: string | null
  /** The version the open files came from. */
  codeVersionId: string | null
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
  const rows = useMemo(
    () =>
      orderSteps(
        flowNodes.map((n) => ({ id: n.id, type: n.data.irNode.type, position: n.position })),
        edges.map((e) => ({
          source: e.source,
          target: e.target,
          ...(typeof e.label === 'string' && { label: e.label }),
        })),
      ),
    [flowNodes, edges],
  )
  const map = useMemo(
    () =>
      buildStepMap({
        manifest,
        nodeIds: rows.map((r) => r.nodeId),
        files: deferredFiles,
        projectPaths,
      }),
    [manifest, rows, deferredFiles, projectPaths],
  )

  const value = useMemo<StepSyncValue>(
    () => ({
      workflowId,
      linkVersion,
      kind,
      map,
      rows,
      nodes,
      workflowFile,
      versions,
      graphVersionId,
      codeVersionId,
    }),
    [
      workflowId,
      linkVersion,
      kind,
      map,
      rows,
      nodes,
      workflowFile,
      versions,
      graphVersionId,
      codeVersionId,
    ],
  )
  return <StepSyncContext.Provider value={value}>{children}</StepSyncContext.Provider>
}

export function useStepSync(): StepSyncValue {
  const value = useContext(StepSyncContext)
  if (!value) throw new Error('useStepSync must be used inside a StepSyncProvider')
  return value
}
