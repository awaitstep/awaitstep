import type { WorkflowNode } from '@awaitstep/ir'
import { ApiError } from '../api-client'

/** A custom node the source could not be built for, as the graph names it. */
export interface MissingNode {
  nodeId: string
  name: string
  /** The API's reason: not reachable from this project, not published yet, or broken. */
  reason: string
}

/**
 * The custom node that kept the source from loading: the first library
 * finding the API sent that names a `custom:` node in the loaded graph — one
 * this project cannot reach (imported from another organization), one with no
 * published version, or one whose package is broken. Null for any other
 * failure, which the workspace reports as it always has.
 */
export function missingLibraryNode(
  error: unknown,
  nodes: readonly Pick<WorkflowNode, 'id' | 'type' | 'name'>[] | undefined,
): MissingNode | null {
  if (!(error instanceof ApiError) || !nodes) return null
  for (const diagnostic of error.diagnostics) {
    if (diagnostic.source !== 'library' || diagnostic.nodeId === undefined) continue
    const node = nodes.find((candidate) => candidate.id === diagnostic.nodeId)
    if (node?.type.startsWith('custom:')) {
      return { nodeId: node.id, name: node.name, reason: diagnostic.message }
    }
  }
  return null
}

/** What the toast says when Code switches to the canvas for such a node: the API's own reason. */
export function missingNodeMessage(node: MissingNode): string {
  return `Code can’t open because of “${node.name}”: ${node.reason}`
}
