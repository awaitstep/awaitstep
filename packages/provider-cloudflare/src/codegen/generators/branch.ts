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
      const chain = collectChain(target, ctx.adj, ctx.inDegree, ctx.nodeMap, ctx.edgeLabels)
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

const CONTAINER_TYPES = new Set(['branch', 'parallel', 'try_catch', 'loop', 'race'])

export function collectChain(
  startId: string,
  adj: Map<string, string[]>,
  inDegree: Map<string, number>,
  nodeMap: Map<string, WorkflowNode>,
  edgeLabels: Map<string, Map<string, string | undefined>>,
): WorkflowNode[] {
  const chain: WorkflowNode[] = []
  let currentId: string | null = startId

  while (currentId) {
    const node = nodeMap.get(currentId)
    if (!node) break

    chain.push(node)

    if (CONTAINER_TYPES.has(node.type)) {
      // Container's normal successors are emitted by the container's own
      // generator (branches/body/etc.); the only thing that flows past it in
      // the parent context is the `then` continuation. Follow it if present
      // and not a join point — otherwise stop.
      const labels = edgeLabels.get(currentId)
      let thenTarget: string | null = null
      if (labels) {
        for (const [target, label] of labels) {
          if (label === 'then') {
            thenTarget = target
            break
          }
        }
      }
      if (thenTarget && (inDegree.get(thenTarget) ?? 0) === 1) {
        currentId = thenTarget
        continue
      }
      break
    }

    const successors: string[] = adj.get(currentId) ?? []
    if (successors.length === 1 && (inDegree.get(successors[0]) ?? 0) === 1) {
      currentId = successors[0]!
    } else {
      currentId = null
    }
  }

  return chain
}
