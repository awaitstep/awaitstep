import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'

export function buildAdjacencyList(ir: WorkflowIR): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const node of ir.nodes) {
    adj.set(node.id, [])
  }
  for (const edge of ir.edges) {
    adj.get(edge.source)?.push(edge.target)
  }
  return adj
}

export function topologicalSort(ir: WorkflowIR): WorkflowNode[] {
  // Find all nodes reachable from entryNodeId
  const reachable = findReachable(ir)
  const reachableNodes = ir.nodes.filter((n) => reachable.has(n.id))
  const reachableEdges = ir.edges.filter((e) => reachable.has(e.source) && reachable.has(e.target))

  const adj = new Map<string, string[]>()
  for (const node of reachableNodes) adj.set(node.id, [])
  for (const edge of reachableEdges) adj.get(edge.source)?.push(edge.target)

  const inDegree = new Map<string, number>()
  for (const node of reachableNodes) inDegree.set(node.id, 0)
  for (const edge of reachableEdges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue: string[] = [ir.entryNodeId]
  const sorted: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    sorted.push(current)
    for (const neighbor of adj.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  if (sorted.length !== reachableNodes.length) {
    throw new Error('Workflow graph contains a cycle')
  }

  const nodeMap = new Map(reachableNodes.map((n) => [n.id, n]))
  return sorted.map((id) => nodeMap.get(id)!).filter(Boolean)
}

function findReachable(ir: WorkflowIR): Set<string> {
  const adj = new Map<string, string[]>()
  for (const node of ir.nodes) adj.set(node.id, [])
  for (const edge of ir.edges) adj.get(edge.source)?.push(edge.target)

  const visited = new Set<string>()
  const queue = [ir.entryNodeId]
  visited.add(ir.entryNodeId)

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return visited
}

export function getEdgeLabels(ir: WorkflowIR): Map<string, Map<string, string | undefined>> {
  const labels = new Map<string, Map<string, string | undefined>>()
  for (const node of ir.nodes) {
    labels.set(node.id, new Map())
  }
  for (const edge of ir.edges) {
    labels.get(edge.source)?.set(edge.target, edge.label)
  }
  return labels
}
