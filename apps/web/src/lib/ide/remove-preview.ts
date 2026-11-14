import {
  computeVarNames,
  nodeReaders,
  removeNode,
  type EmptiedArm,
  type GraphShape,
  type NodeReader,
  type RenamedNode,
} from '@awaitstep/codegen'
import { stepSourcePath, type NodeId } from '@awaitstep/ir'

/** A surviving node whose name moves, and its open file's unsaved changes if any. */
export interface RenamedPreview extends RenamedNode {
  /** The step's file has unsaved changes written against its old function name. */
  draftPath: string | null
}

export type RemovePreview =
  | { status: 'missing' }
  | { status: 'blocked'; name: string; reason: string }
  | {
      status: 'ok'
      name: string
      /** Reads of its value that break: they show an error until changed. */
      readers: NodeReader[]
      /**
       * Reads that name it and will read another node instead, without an
       * error, because that node's name takes over the removed one's.
       */
      rebound: { readers: NodeReader[]; toName: string } | null
      emptiedArms: EmptiedArm[]
      renamed: RenamedPreview[]
      /** The step's own file when it has unsaved changes the removal discards. */
      draftPath: string | null
    }

/** What removing `nodeId` would do, for the dialog to say before anything is written. */
export function removePreview(
  graph: GraphShape,
  nodeId: NodeId,
  drafts: Readonly<Record<string, unknown>>,
): RemovePreview {
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (!node) return { status: 'missing' }
  const result = removeNode(graph, nodeId)
  if (!result.ok) return { status: 'blocked', name: node.name, reason: result.reason }

  const removedName = computeVarNames(graph.nodes).get(nodeId)
  const takenBy = result.renamed.find((entry) => entry.to === removedName)
  const all = nodeReaders(graph, nodeId)
  const followers = takenBy ? all.filter((reader) => reader.byName) : []
  const following = new Set(followers)
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
  const draftOf = (id: NodeId): string | null => {
    const path = stepSourcePath(id)
    return nodesById.get(id)?.type === 'step' && path in drafts ? path : null
  }

  return {
    status: 'ok',
    name: node.name,
    readers: all.filter((reader) => !following.has(reader)),
    rebound: takenBy && followers.length > 0 ? { readers: followers, toName: takenBy.name } : null,
    emptiedArms: result.emptiedArms,
    renamed: result.renamed.map((entry) => ({ ...entry, draftPath: draftOf(entry.nodeId) })),
    draftPath: draftOf(nodeId),
  }
}
