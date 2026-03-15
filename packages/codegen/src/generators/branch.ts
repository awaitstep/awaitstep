import type { BranchNode, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { buildAdjacencyList, getEdgeLabels } from '../dag.js'

export function generateBranch(
  node: BranchNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
): string {
  const adj = buildAdjacencyList(ir)
  const edgeLabels = getEdgeLabels(ir)
  const targets = adj.get(node.id) ?? []
  const nodeLabels = edgeLabels.get(node.id) ?? new Map()
  const nodeMap = new Map(ir.nodes.map((n) => [n.id, n]))

  const trueTarget = targets.find((t) => nodeLabels.get(t) === 'true')
  const falseTarget = targets.find((t) => nodeLabels.get(t) === 'false')

  const lines: string[] = []
  lines.push(`if (${node.condition}) {`)

  if (trueTarget) {
    const targetNode = nodeMap.get(trueTarget)
    if (targetNode) {
      lines.push(`  ${generateNode(targetNode, ir).replace(/\n/g, '\n  ')}`)
    }
  }

  if (falseTarget) {
    lines.push(`} else {`)
    const targetNode = nodeMap.get(falseTarget)
    if (targetNode) {
      lines.push(`  ${generateNode(targetNode, ir).replace(/\n/g, '\n  ')}`)
    }
  }

  lines.push(`}`)
  return lines.join('\n')
}
