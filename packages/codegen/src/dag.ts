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
  const adj = buildAdjacencyList(ir)
  const inDegree = new Map<string, number>()

  for (const node of ir.nodes) {
    inDegree.set(node.id, 0)
  }
  for (const edge of ir.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

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

  if (sorted.length !== ir.nodes.length) {
    throw new Error('Workflow graph contains a cycle')
  }

  const nodeMap = new Map(ir.nodes.map((n) => [n.id, n]))
  return sorted.map((id) => nodeMap.get(id)!)
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
