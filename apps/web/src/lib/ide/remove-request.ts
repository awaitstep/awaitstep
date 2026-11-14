import { removalBlocker } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'
import { actionToast } from '../action-toast'
import { findEntryNodeId } from '../build-ir'
import { useIdeStore } from '../../stores/ide-store'
import { useWorkflowStore } from '../../stores/workflow-store'

/**
 * Remove… from the row menu, the inspector or the palette: a node Code can
 * remove opens the confirmation dialog; one it can't (a container, the only
 * node) says why in a toast, so the item never sits greyed out unexplained.
 */
export function requestNodeRemoval(nodeId: string, blocker: string | null): void {
  if (blocker !== null) {
    actionToast.error(blocker)
    return
  }
  useIdeStore.getState().showDialog('removeNode', nodeId)
}

/** Why Code can't remove `nodeId` from the graph the workspace shows now, or null. */
export function currentRemovalBlocker(nodeId: string): string | null {
  const { nodes, edges } = useWorkflowStore.getState()
  const graphEdges = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(typeof edge.label === 'string' && { label: edge.label }),
  }))
  return removalBlocker(
    {
      nodes: nodes.map((node) => node.data.irNode as WorkflowNode),
      edges: graphEdges,
      entryNodeId: findEntryNodeId(nodes, graphEdges),
    },
    nodeId,
  )
}
