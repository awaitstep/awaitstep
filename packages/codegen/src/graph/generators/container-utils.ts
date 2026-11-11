import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import {
  buildAdjacencyList,
  childContext,
  computeVarNames,
  getEdgeLabels,
  stepLabel,
  upstreamVarNames,
  type GenerateMode,
  type GenerationContext,
} from '../internal.js'
import { collectChain, computeInDegree } from './branch.js'
import { boundVarNames } from '../export-plan.js'
import { emitGroupedChain } from '../coalesce.js'

export interface ContainerContext {
  adj: Map<string, string[]>
  inDegree: Map<string, number>
  nodeMap: Map<string, WorkflowNode>
  edgeLabels: Map<string, Map<string, string | undefined>>
}

export function prepareContainerContext(ir: WorkflowIR): ContainerContext {
  return {
    adj: buildAdjacencyList(ir),
    inDegree: computeInDegree(ir),
    nodeMap: new Map(ir.nodes.map((n) => [n.id, n])),
    edgeLabels: getEdgeLabels(ir),
  }
}

/**
 * The node a container's arms fall into when they merge into one: a shared
 * successor of every arm's last node that something else also points at. That
 * merge runs on each path, so each arm keeps its own scope.
 *
 * Only a branch's arms and a wait's paths use this. A loop or a parallel runs
 * its children for reasons of its own, and a try/catch's arms must not carry
 * the code after them (a throw there would be caught by the same try).
 */
export function joinTarget(
  containers: ContainerContext,
  armTargets: string[],
): WorkflowNode | null {
  const targets = [...new Set(armTargets.filter((id) => id.length > 0))]
  if (targets.length < 2) return null
  const lastOf = (id: string): string => {
    const chain = collectChain(
      id,
      containers.adj,
      containers.inDegree,
      containers.nodeMap,
      containers.edgeLabels,
    )
    return chain[chain.length - 1]?.id ?? id
  }
  const ends = targets.map(lastOf)
  const first = containers.adj.get(ends[0]!) ?? []
  const shared = first.filter(
    (id) =>
      ends.every((end) => end !== id && (containers.adj.get(end) ?? []).includes(id)) &&
      (containers.inDegree.get(id) ?? 0) >= 2,
  )
  return shared.length === 1 ? (containers.nodeMap.get(shared[0]!) ?? null) : null
}

/**
 * A generation context for a merge chain that is emitted inside one arm: its
 * inputs are what that arm's path has in scope, computed as if the chain hung
 * off the arm's last node.
 */
export function armContext(
  ir: WorkflowIR,
  ctx: GenerationContext,
  armLastId: string,
  joinId: string,
): GenerationContext {
  const armIr: WorkflowIR = {
    ...ir,
    edges: ir.edges.filter((edge) => edge.target !== joinId || edge.source === armLastId),
  }
  // Only names the emitter actually binds count: a sleep, a branch or an
  // inline step has no variable to pass.
  const names = computeVarNames(ir.nodes)
  const scoped = upstreamVarNames(armIr, boundVarNames(armIr, names), () => false)
  return {
    ...childContext(ctx),
    upstreamVars: (nodeId: string) => scoped.get(nodeId) ?? ctx.upstreamVars(nodeId),
  }
}

export function indentCode(code: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return code
    .split('\n')
    .map((line) => (line.trim() ? `${pad}${line}` : line))
    .join('\n')
}

export function inlineChain(
  startId: string,
  containers: ContainerContext,
  generateNode: (node: WorkflowNode, ir: WorkflowIR, ctx?: GenerationContext) => string,
  ir: WorkflowIR,
  spaces: number,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
  /** The children's context when the container binds something for them (a catch arm's error). */
  override?: GenerationContext,
): string {
  const chain = collectChain(
    startId,
    containers.adj,
    containers.inDegree,
    containers.nodeMap,
    containers.edgeLabels,
  )
  // Workflow-mode chains coalesce adjacent plain steps (F9 billing); script
  // mode has no step primitives to merge.
  const parts =
    mode === 'workflow'
      ? emitGroupedChain(chain, ir, ctx, generateNode, override)
      : chain.map((n) => generateNode(n, ir, override))
  return parts.map((code) => indentCode(code, spaces)).join('\n')
}

/**
 * Filters outgoing edges from a node, excluding "then" continuation edges.
 * Returns target node IDs for fork branches.
 */
export function getForkTargets(nodeId: string, ir: WorkflowIR): string[] {
  const allTargets = new Set<string>()
  const thenTargets = new Set<string>()
  for (const e of ir.edges) {
    if (e.source !== nodeId) continue
    if (e.label === 'then') thenTargets.add(e.target)
    else allTargets.add(e.target)
  }
  return [...allTargets].filter((t) => !thenTargets.has(t))
}

/**
 * Shared generator for Promise.all / Promise.race containers.
 * Wraps in a durable step for caching per CF workflow rules.
 */
export function generatePromiseContainer(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  method: 'allSettled' | 'race',
  generateNode: (node: WorkflowNode, ir: WorkflowIR, ctx?: GenerationContext) => string,
  mode: GenerateMode = 'workflow',
): string {
  const containers = prepareContainerContext(ir)
  const targets = getForkTargets(node.id, ir)

  if (targets.length === 0) return `// ${method === 'race' ? 'race' : 'parallel'}: no branches`

  const branches = targets
    .map((targetId) => {
      const chain = collectChain(
        targetId,
        containers.adj,
        containers.inDegree,
        containers.nodeMap,
        containers.edgeLabels,
      )
      if (chain.length === 0) return null
      const code = chain.map((n) => generateNode(n, ir)).join('\n')
      // If the last node in the branch bound a variable, surface it as the
      // branch's promise value so callers can destructure it from
      // Promise.all / allSettled / race results. Side-effect-only nodes get
      // no return — the branch resolves to undefined as before.
      const lastNode = chain[chain.length - 1]!
      const lastVar = ctx.varName(lastNode.id)
      const declRe = new RegExp(`(?:^|\\n)\\s*(?:let|const)\\s+${lastVar}\\b`)
      const tail = declRe.test(code) ? `\n      return ${lastVar};` : ''
      return `    async () => {\n${indentCode(code, 6)}${tail}\n    }`
    })
    .filter(Boolean)

  if (mode === 'script') {
    return `const ${ctx.varName(node.id)} = await Promise.${method}([
${branches.join(',\n')}
].map(fn => fn()));`
  }
  return `const ${ctx.varName(node.id)} = await flow.step("${stepLabel(node)}", async () => {
  return await Promise.${method}([
${branches.join(',\n')}
  ].map(fn => fn()));
});`
}
