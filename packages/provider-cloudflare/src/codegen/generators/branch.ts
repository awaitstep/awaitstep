import type { WorkflowIR, WorkflowNode, BranchCondition } from '@awaitstep/ir'
import { prepareContainerContext, inlineChain } from './container-utils.js'

export function generateBranch(
  node: WorkflowNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
): string {
  const branches = (node.data.branches ?? []) as BranchCondition[]
  const ctx = prepareContainerContext(ir)
  const targets = ctx.adj.get(node.id) ?? []
  const nodeLabels = ctx.edgeLabels.get(node.id) ?? new Map()

  const lines: string[] = []

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i]!
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
      lines.push(inlineChain(target, ctx, generateNode, ir, 2))
    }
  }

  lines.push(`}`)
  return lines.join('\n')
}

export function collectBranchInlineTargets(ir: WorkflowIR): Set<string> {
  const ctx = prepareContainerContext(ir)
  const inlineTargets = new Set<string>()

  const inlineLabels = new Set(['body', 'try', 'catch', 'finally'])
  const containerTypes = new Set(['branch', 'parallel', 'try_catch', 'loop', 'race'])

  for (const node of ir.nodes) {
    if (!containerTypes.has(node.type)) continue

    const targets =
      node.type === 'loop' || node.type === 'try_catch'
        ? ir.edges
            .filter((e) => e.source === node.id && inlineLabels.has(e.label ?? ''))
            .map((e) => e.target)
        : ir.edges.filter((e) => e.source === node.id && e.label !== 'then').map((e) => e.target)

    for (const target of targets) {
      const chain = collectChain(target, ctx.adj, ctx.inDegree, ctx.nodeMap)
      for (const chainNode of chain) {
        inlineTargets.add(chainNode.id)
      }
    }
  }

  return inlineTargets
}

export function computeInDegree(ir: WorkflowIR): Map<string, number> {
  const inDegree = new Map<string, number>()
  for (const edge of ir.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }
  return inDegree
}

export function collectChain(
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

    if (
      node.type === 'branch' ||
      node.type === 'parallel' ||
      node.type === 'try_catch' ||
      node.type === 'loop' ||
      node.type === 'race'
    )
      break

    const successors: string[] = adj.get(currentId) ?? []
    if (successors.length === 1 && (inDegree.get(successors[0]) ?? 0) === 1) {
      currentId = successors[0]!
    } else {
      currentId = null
    }
  }

  return chain
}
