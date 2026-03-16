import type { Edge, Node } from '@xyflow/react'

export interface NearestEdgeResult {
  edge: Edge
  point: { x: number; y: number }
  distance: number
}

/**
 * Find the nearest edge to a given point using parametric line projection.
 * Returns the closest edge within the threshold, or null.
 */
export function findNearestEdge(
  point: { x: number; y: number },
  edges: Edge[],
  nodes: Node[],
  threshold = 40,
): NearestEdgeResult | null {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  let best: NearestEdgeResult | null = null

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)
    if (!sourceNode || !targetNode) continue

    const sourceWidth = sourceNode.measured?.width ?? sourceNode.width ?? 200
    const sourceHeight = sourceNode.measured?.height ?? sourceNode.height ?? 60
    const targetWidth = targetNode.measured?.width ?? targetNode.width ?? 200
    const targetHeight = targetNode.measured?.height ?? targetNode.height ?? 60

    // Use node center positions
    const sx = sourceNode.position.x + sourceWidth / 2
    const sy = sourceNode.position.y + sourceHeight / 2
    const tx = targetNode.position.x + targetWidth / 2
    const ty = targetNode.position.y + targetHeight / 2

    const result = projectPointOnSegment(point, { x: sx, y: sy }, { x: tx, y: ty })

    if (result.distance < threshold && (!best || result.distance < best.distance)) {
      best = { edge, point: result.point, distance: result.distance }
    }
  }

  return best
}

/**
 * Project a point onto a line segment and return the closest point + distance.
 * Uses parametric projection with t clamped to [0, 1].
 */
export function projectPointOnSegment(
  point: { x: number; y: number },
  segStart: { x: number; y: number },
  segEnd: { x: number; y: number },
): { point: { x: number; y: number }; distance: number; t: number } {
  const dx = segEnd.x - segStart.x
  const dy = segEnd.y - segStart.y
  const lengthSq = dx * dx + dy * dy

  // Degenerate case: segment is a point
  if (lengthSq === 0) {
    const dist = Math.sqrt(
      (point.x - segStart.x) ** 2 + (point.y - segStart.y) ** 2,
    )
    return { point: { x: segStart.x, y: segStart.y }, distance: dist, t: 0 }
  }

  // Parametric projection: t = dot(point - start, end - start) / |end - start|^2
  const t = Math.max(
    0,
    Math.min(1, ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSq),
  )

  const projX = segStart.x + t * dx
  const projY = segStart.y + t * dy
  const distance = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)

  return { point: { x: projX, y: projY }, distance, t }
}
