import type { Edge } from '@xyflow/react'
import type { FlowNode } from '../stores/workflow-store'

const CONTAINER_TYPES = new Set(['loop', 'try_catch'])

const INLINE_LABEL_COLORS: Record<string, string> = {
  body: 'oklch(0.7 0.12 200)',
  try: 'oklch(0.7 0.12 55)',
  catch: 'oklch(0.7 0.12 55)',
  finally: 'oklch(0.7 0.12 55)',
}

/**
 * Builds a map of edgeId → color for all edges inside container bodies
 * (loop body chains, try/catch/finally chains). Walks each labeled edge's
 * target chain and colors every edge along the way.
 *
 * Only depends on graph topology (node types + edge connections), not positions.
 */
export function buildContainerEdgeColors(nodes: FlowNode[], edges: Edge[]): Map<string, string> {
  const colors = new Map<string, string>()

  const hasContainers = nodes.some((n) => CONTAINER_TYPES.has(n.data.irNode.type))
  if (!hasContainers) return colors

  const nodeTypeMap = new Map<string, string>()
  for (const n of nodes) nodeTypeMap.set(n.id, n.data.irNode.type)

  const adj = new Map<string, { target: string; edgeId: string }[]>()
  for (const e of edges) {
    let list = adj.get(e.source)
    if (!list) {
      list = []
      adj.set(e.source, list)
    }
    list.push({ target: e.target, edgeId: e.id })
  }

  for (const e of edges) {
    const sourceType = nodeTypeMap.get(e.source)
    if (!sourceType || !CONTAINER_TYPES.has(sourceType)) continue
    const color = typeof e.label === 'string' ? INLINE_LABEL_COLORS[e.label] : undefined
    if (!color) continue

    colors.set(e.id, color)
    let currentId: string | null = e.target
    const visited = new Set<string>()

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const type = nodeTypeMap.get(currentId)
      if (!type) break

      const isContainer =
        type === 'branch' ||
        type === 'parallel' ||
        type === 'loop' ||
        type === 'try_catch' ||
        type === 'race'
      const successors: { target: string; edgeId: string }[] = adj.get(currentId) ?? []

      for (const succ of successors) {
        colors.set(succ.edgeId, color)
      }

      if (isContainer) break
      currentId = successors.length === 1 ? successors[0].target : null
    }
  }

  return colors
}
