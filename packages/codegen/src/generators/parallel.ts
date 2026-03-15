import type { ParallelNode, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { buildAdjacencyList } from '../dag.js'

export function generateParallel(
  node: ParallelNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
): string {
  const adj = buildAdjacencyList(ir)
  const targets = adj.get(node.id) ?? []
  const nodeMap = new Map(ir.nodes.map((n) => [n.id, n]))

  if (targets.length === 0) return '// parallel: no branches'

  const branches = targets
    .map((targetId) => {
      const targetNode = nodeMap.get(targetId)
      if (!targetNode) return null
      const code = generateNode(targetNode, ir)
      return `  async () => {\n    ${code.replace(/\n/g, '\n    ')}\n  }`
    })
    .filter(Boolean)

  return `await Promise.all([
${branches.join(',\n')}
].map(fn => fn()));`
}
