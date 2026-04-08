import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { buildAdjacencyList, getEdgeLabels, varName, escName } from '@awaitstep/codegen'
import { collectChain, computeInDegree } from './branch.js'

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
  ctx: ContainerContext,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
  ir: WorkflowIR,
  spaces: number,
): string {
  const chain = collectChain(startId, ctx.adj, ctx.inDegree, ctx.nodeMap)
  return chain
    .map((n) => {
      const code = generateNode(n, ir)
      return indentCode(code, spaces)
    })
    .join('\n')
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
  method: 'allSettled' | 'race',
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
): string {
  const ctx = prepareContainerContext(ir)
  const targets = getForkTargets(node.id, ir)

  if (targets.length === 0) return `// ${method === 'race' ? 'race' : 'parallel'}: no branches`

  const branches = targets
    .map((targetId) => {
      const chain = collectChain(targetId, ctx.adj, ctx.inDegree, ctx.nodeMap)
      if (chain.length === 0) return null
      const code = chain.map((n) => generateNode(n, ir)).join('\n')
      return `    async () => {\n${indentCode(code, 6)}\n    }`
    })
    .filter(Boolean)

  return `const ${varName(node.id)} = await step.do("${escName(node.name)}", async () => {
  return await Promise.${method}([
${branches.join(',\n')}
  ].map(fn => fn()));
});`
}
