import type { WorkflowNode, Edge } from '@awaitstep/ir'
import type { StepStatus } from '../stores/run-overlay-store'

export function computeStepStatuses(
  nodes: WorkflowNode[],
  edges: Edge[],
  entryNodeId: string,
  runStatus: string,
): Record<string, StepStatus> {
  const statuses: Record<string, StepStatus> = {}

  // Build adjacency and compute topological order from entry
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) adj.get(e.source)?.push(e.target)

  const order: string[] = []
  const visited = new Set<string>()
  const queue = [entryNodeId]
  visited.add(entryNodeId)
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const next of adj.get(id) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }

  // Mark unreachable nodes as skipped
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      statuses[n.id] = 'skipped'
    }
  }

  if (runStatus === 'queued') {
    for (const id of order) statuses[id] = 'pending'
    return statuses
  }

  if (runStatus === 'complete') {
    for (const id of order) statuses[id] = 'complete'
    return statuses
  }

  if (runStatus === 'terminated') {
    for (const id of order) statuses[id] = 'pending'
    return statuses
  }

  if (runStatus === 'errored') {
    // Last node in order is likely the one that errored, rest complete
    for (let i = 0; i < order.length - 1; i++) {
      statuses[order[i]] = 'complete'
    }
    if (order.length > 0) {
      statuses[order[order.length - 1]] = 'errored'
    }
    return statuses
  }

  // running / paused / waiting — first node running, rest pending
  if (order.length > 0) {
    statuses[order[0]] = runStatus === 'paused' ? 'pending' : 'running'
    for (let i = 1; i < order.length; i++) {
      statuses[order[i]] = 'pending'
    }
  }

  return statuses
}
