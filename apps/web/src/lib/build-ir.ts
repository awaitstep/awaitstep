import { IR_VERSION } from '@awaitstep/ir'
import type { EnvDeclaration, WorkflowRuntime } from '@awaitstep/ir'
import { SECRET_PREFIX } from './env-var-parser'
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

type BuildState = Pick<
  StoreState,
  | 'metadata'
  | 'nodes'
  | 'edges'
  | 'kind'
  | 'triggerCode'
  | 'dependencies'
  | 'workflowEnvVars'
  | 'runtimeBindings'
>

/**
 * The runtime block makes the exported IR self-contained: trigger code, npm
 * deps, env declarations (names + secrecy only — never values), and binding
 * declarations all travel with the document.
 */
function buildRuntime(state: BuildState): WorkflowRuntime | undefined {
  const env: EnvDeclaration[] = state.workflowEnvVars.flatMap((v) => {
    const secret = v.name.startsWith(SECRET_PREFIX)
    const name = (secret ? v.name.slice(SECRET_PREFIX.length) : v.name).trim()
    // A bare "SECRET_" or blank row would export an invalid declaration that
    // the schema rejects on reimport — drop it instead.
    if (!name) return []
    return [{ name, ...(secret && { secret: true }) }]
  })
  const runtime: WorkflowRuntime = {
    ...(state.triggerCode && { triggerCode: state.triggerCode }),
    ...(Object.keys(state.dependencies).length > 0 && { dependencies: state.dependencies }),
    ...(env.length > 0 && { env }),
    ...(state.runtimeBindings.length > 0 && { bindings: state.runtimeBindings }),
  }
  return Object.keys(runtime).length > 0 ? runtime : undefined
}

export function buildIRFromState(state: BuildState) {
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
  const runtime = buildRuntime(state)
  const base = {
    irVersion: IR_VERSION,
    metadata: state.metadata,
    nodes: irNodes,
    edges: irEdges,
    entryNodeId: findEntryNodeId(irNodes, irEdges),
    ...(runtime && { runtime }),
  }
  // Scripts require both `kind: 'script'` and a `trigger` per ScriptIRSchema;
  // default to HTTP since v1 only supports HTTP-triggered scripts.
  if (state.kind === 'script') {
    return { ...base, kind: 'script' as const, trigger: { type: 'http' as const } }
  }
  return base
}
