import type { useWorkflowStore } from '../stores/workflow-store'

type StoreState = ReturnType<typeof useWorkflowStore.getState>

export function findEntryNodeId(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
): string {
  const targets = new Set(edges.map((e) => e.target))
  const roots = nodes.filter((n) => !targets.has(n.id))
  if (roots.length <= 1) return roots[0]?.id ?? nodes[0]?.id ?? ''

  // Multiple roots — pick the one with the most descendants
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) adj.get(e.source)?.push(e.target)

  let bestId = roots[0]!.id
  let bestCount = 0
  for (const root of roots) {
    let count = 0
    const visited = new Set<string>()
    const queue = [root.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      count++
      for (const n of adj.get(id) ?? []) queue.push(n)
    }
    if (count > bestCount) {
      bestCount = count
      bestId = root.id
    }
  }
  return bestId
}

export function buildIRFromState(state: Pick<StoreState, 'metadata' | 'nodes' | 'edges' | 'kind'>) {
  const irNodes = state.nodes.map((n) => ({
    ...n.data.irNode,
    position: n.position ?? n.data.irNode.position,
  }))
  const irEdges = state.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.label ? { label: String(e.label) } : {}),
  }))
  const base = {
    metadata: state.metadata,
    nodes: irNodes,
    edges: irEdges,
    entryNodeId: findEntryNodeId(irNodes, irEdges),
  }
  // Scripts require both `kind: 'script'` and a `trigger` per ScriptIRSchema;
  // default to HTTP since v1 only supports HTTP-triggered scripts.
  if (state.kind === 'script') {
    return { ...base, kind: 'script' as const, trigger: { type: 'http' as const } }
  }
  return base
}
