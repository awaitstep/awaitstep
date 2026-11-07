import { IR_VERSION } from '@awaitstep/ir'
import type { EnvDeclaration, WorkflowRuntime } from '@awaitstep/ir'
import { splitSecretName } from './env-var-parser'
import type { useWorkflowStore } from '../stores/workflow-store'

type StoreState = ReturnType<typeof useWorkflowStore.getState>

export function findEntryNodeId(
  nodes: readonly { id: string }[],
  edges: readonly { source: string; target: string }[],
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
  'metadata' | 'nodes' | 'edges' | 'kind' | 'workflowEnvVars' | 'runtimeBindings'
>

/**
 * The runtime block carries what the canvas owns: env declarations (names +
 * secrecy only — never values) and binding declarations. Trigger code and
 * npm dependencies are project files (`handlers.ts`, `package.json`) the
 * canvas only mirrors, so it never writes them into a version — a stale
 * mirror could otherwise resurrect a file the code workspace deleted.
 */
function buildRuntime(state: BuildState): WorkflowRuntime | undefined {
  const env: EnvDeclaration[] = state.workflowEnvVars.flatMap((v) => {
    const { name, isSecret } = splitSecretName(v.name)
    const trimmed = name.trim()
    // A bare "SECRET_" or blank row would export an invalid declaration that
    // the schema rejects on reimport — drop it instead.
    if (!trimmed) return []
    return [{ name: trimmed, ...(isSecret && { secret: true }) }]
  })
  const runtime: WorkflowRuntime = {
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
