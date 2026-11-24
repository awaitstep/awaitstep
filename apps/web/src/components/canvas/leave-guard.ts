import { actionToast } from '../../lib/action-toast'
import { useWorkflowStore } from '../../stores/workflow-store'
import { validateNode } from './node-config-panel'

/**
 * Whether the selection may move off the selected node. A node with errors
 * keeps it, and the first error says why — the step's form marks no field, so
 * the reason rides as the toast's description (D-AT-4).
 */
export function canLeaveSelectedNode(nextId: string | null): boolean {
  const { selectedNodeId, nodes } = useWorkflowStore.getState()
  if (!selectedNodeId || nextId === selectedNodeId) return true
  const current = nodes.find((n) => n.id === selectedNodeId)
  if (!current) return true
  const errors = validateNode(current.data.irNode)
  if (errors.length === 0) return true
  actionToast.error('Fix this step before leaving it', { description: errors[0] })
  return false
}
