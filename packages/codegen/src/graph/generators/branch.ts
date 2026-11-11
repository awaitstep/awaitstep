import type { WorkflowIR, WorkflowNode, BranchCondition } from '@awaitstep/ir'
import type { GenerateMode, GenerationContext } from '../internal.js'
import { CONTAINER_TYPES, collectChain, computeInDegree } from '../internal.js'
import { prepareContainerContext, inlineChain, joinTarget, armContext } from './container-utils.js'

export { CONTAINER_TYPES, collectChain, computeInDegree }

export function generateBranch(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  generateNode: (node: WorkflowNode, ir: WorkflowIR, ctx?: GenerationContext) => string,
  mode: GenerateMode = 'workflow',
): string {
  const branches = (node.data.branches ?? []) as BranchCondition[]
  const containers = prepareContainerContext(ir)
  const targets = containers.adj.get(node.id) ?? []
  const nodeLabels = containers.edgeLabels.get(node.id) ?? new Map()
  // The node the arms fall into runs on each path: emit it inside every arm,
  // with that arm's own scope, instead of after the if/else.
  const arms = branches.map((branch) => targets.find((t) => nodeLabels.get(t) === branch.label))
  const join = joinTarget(
    containers,
    arms.filter((target): target is string => typeof target === 'string'),
  )

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
      const arm = inlineChain(target, containers, generateNode, ir, 2, ctx, mode)
      if (!join) {
        lines.push(arm)
      } else {
        const chain = collectChain(
          target,
          containers.adj,
          containers.inDegree,
          containers.nodeMap,
          containers.edgeLabels,
        )
        const armLast = chain[chain.length - 1]?.id ?? target
        const merged = inlineChain(
          join.id,
          containers,
          generateNode,
          ir,
          2,
          ctx,
          mode,
          armContext(ir, ctx, armLast, join.id),
        )
        lines.push([arm, merged].filter(Boolean).join('\n'))
      }
    }
  }

  lines.push(`}`)
  return lines.join('\n')
}

export function collectBranchInlineTargets(ir: WorkflowIR): Set<string> {
  const containers = prepareContainerContext(ir)
  const inlineTargets = new Set<string>()

  const inlineLabels = new Set(['body', 'try', 'catch', 'finally'])
  const containerTypes = new Set(['branch', 'parallel', 'try_catch', 'loop', 'race'])

  for (const node of ir.nodes) {
    if (!containerTypes.has(node.type) && node.type !== 'wait_for_event') continue

    const targets =
      node.type === 'wait_for_event'
        ? [
            ...new Set([
              ...ir.edges
                .filter(
                  (e) => e.source === node.id && (e.label === 'onEvent' || e.label === 'onTimeout'),
                )
                .map((e) => e.target),
              ...[node.data.onEventNode, node.data.onTimeoutNode].filter(
                (id): id is string => typeof id === 'string' && id.length > 0,
              ),
            ]),
          ]
        : node.type === 'loop' || node.type === 'try_catch'
          ? ir.edges
              .filter((e) => e.source === node.id && inlineLabels.has(e.label ?? ''))
              .map((e) => e.target)
          : ir.edges.filter((e) => e.source === node.id && e.label !== 'then').map((e) => e.target)

    for (const target of targets) {
      const chain = collectChain(
        target,
        containers.adj,
        containers.inDegree,
        containers.nodeMap,
        containers.edgeLabels,
      )
      for (const chainNode of chain) {
        inlineTargets.add(chainNode.id)
      }
    }

    if (node.type !== 'branch' && node.type !== 'wait_for_event') continue
    if (node.type === 'branch') {
      const join = joinTarget(containers, targets)
      if (!join) continue
      for (const chainNode of collectChain(
        join.id,
        containers.adj,
        containers.inDegree,
        containers.nodeMap,
        containers.edgeLabels,
      )) {
        inlineTargets.add(chainNode.id)
      }
      continue
    }
    // A merge of the two arms is emitted inside each arm, so the top level
    // must not emit it again.
    const declared = (field: string): string => {
      const value = node.data[field]
      return typeof value === 'string' ? value : ''
    }
    const onEvent =
      declared('onEventNode') ||
      ir.edges.find((edge) => edge.source === node.id && edge.label === 'onEvent')?.target ||
      ''
    const onTimeout =
      declared('onTimeoutNode') ||
      ir.edges.find((edge) => edge.source === node.id && edge.label === 'onTimeout')?.target ||
      ''
    const join = joinTarget(containers, [onEvent, onTimeout])
    if (!join) continue
    for (const chainNode of collectChain(
      join.id,
      containers.adj,
      containers.inDegree,
      containers.nodeMap,
      containers.edgeLabels,
    )) {
      inlineTargets.add(chainNode.id)
    }
  }

  return inlineTargets
}
