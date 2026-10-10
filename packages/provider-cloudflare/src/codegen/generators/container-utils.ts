import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import {
  buildAdjacencyList,
  getEdgeLabels,
  stepLabel,
  type GenerateMode,
  type GenerationContext,
} from '@awaitstep/codegen'
import { collectChain, computeInDegree } from './branch.js'
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
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
  ir: WorkflowIR,
  spaces: number,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
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
      ? emitGroupedChain(chain, ir, ctx, generateNode)
      : chain.map((n) => generateNode(n, ir))
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
 * Wraps in step.do for durable caching per CF workflow rules.
 */
export function generatePromiseContainer(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  method: 'allSettled' | 'race',
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
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
  return `const ${ctx.varName(node.id)} = await step.do("${stepLabel(node)}", async () => {
  return await Promise.${method}([
${branches.join(',\n')}
  ].map(fn => fn()));
});`
}
