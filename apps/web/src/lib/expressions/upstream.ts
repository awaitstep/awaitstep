/**
 * Upstream sets under the same semantics codegen and expression validation
 * use: every node TOPOLOGICALLY EARLIER than a node counts as upstream (its
 * step result variable is lexically in scope in generated code), not just
 * strict graph ancestors. Shared by validate-workflow and the expression
 * editor so squiggles, completions, and the binding picker always agree.
 */
export function computeUpstreamSets(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
): Map<string, Set<string>> {
  const nodeAdj = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const node of nodes) {
    nodeAdj.set(node.id, [])
    inDegree.set(node.id, 0)
  }
  for (const edge of edges) {
    nodeAdj.get(edge.source)?.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }
  const queue: string[] = []
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId)
  }
  const order: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    order.push(current)
    for (const neighbor of nodeAdj.get(current) ?? []) {
      const next = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, next)
      if (next === 0) queue.push(neighbor)
    }
  }
  const upstreamSets = new Map<string, Set<string>>()
  const seen = new Set<string>()
  for (const nodeId of order) {
    upstreamSets.set(nodeId, new Set(seen))
    seen.add(nodeId)
  }
  return upstreamSets
}
