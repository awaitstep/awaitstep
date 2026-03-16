import type { BranchNode, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { buildAdjacencyList, getEdgeLabels } from '@awaitstep/codegen'

export function generateBranch(
  node: BranchNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
): string {
  const adj = buildAdjacencyList(ir)
  const edgeLabels = getEdgeLabels(ir)
  const inDegree = computeInDegree(ir)
  const targets = adj.get(node.id) ?? []
  const nodeLabels = edgeLabels.get(node.id) ?? new Map()
  const nodeMap = new Map(ir.nodes.map((n) => [n.id, n]))

  const lines: string[] = []

  for (let i = 0; i < node.branches.length; i++) {
    const branch = node.branches[i]!
    const isFirst = i === 0
    const isElse = branch.condition === ''

    if (isElse) {
      lines.push(`} else {`)
    } else if (isFirst) {
      lines.push(`if (${branch.condition}) {`)
    } else {
      lines.push(`} else if (${branch.condition}) {`)
    }

    const target = targets.find((t) => nodeLabels.get(t) === branch.label)
    if (target) {
      const chain = collectChain(target, adj, inDegree, nodeMap)
      for (const chainNode of chain) {
        lines.push(`  ${generateNode(chainNode, ir).replace(/\n/g, '\n  ')}`)
      }
    }
  }

  lines.push(`}`)
  return lines.join('\n')
}

export function collectBranchInlineTargets(ir: WorkflowIR): Set<string> {
  const adj = buildAdjacencyList(ir)
  const inDegree = computeInDegree(ir)
  const nodeMap = new Map(ir.nodes.map((n) => [n.id, n]))
  const inlineTargets = new Set<string>()

  for (const node of ir.nodes) {
    if (node.type === 'branch' || node.type === 'parallel') {
      for (const target of adj.get(node.id) ?? []) {
        const chain = collectChain(target, adj, inDegree, nodeMap)
        for (const chainNode of chain) {
          inlineTargets.add(chainNode.id)
        }
      }
    }
  }

  return inlineTargets
}

function computeInDegree(ir: WorkflowIR): Map<string, number> {
  const inDegree = new Map<string, number>()
  for (const node of ir.nodes) {
    inDegree.set(node.id, 0)
  }
  for (const edge of ir.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }
  return inDegree
}

function collectChain(
  startId: string,
  adj: Map<string, string[]>,
  inDegree: Map<string, number>,
  nodeMap: Map<string, WorkflowNode>,
): WorkflowNode[] {
  const chain: WorkflowNode[] = []
  let currentId: string | null = startId

  while (currentId) {
    const node = nodeMap.get(currentId)
    if (!node) break

    chain.push(node)

    if (node.type === 'branch' || node.type === 'parallel') break

    const successors: string[] = adj.get(currentId) ?? []
    if (successors.length === 1 && (inDegree.get(successors[0]) ?? 0) === 1) {
      currentId = successors[0]!
    } else {
      currentId = null
    }
  }

  return chain
}
