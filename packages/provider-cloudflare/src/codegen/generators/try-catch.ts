import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { prepareContainerContext, inlineChain } from './container-utils.js'

export function generateTryCatch(
  node: WorkflowNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
): string {
  const ctx = prepareContainerContext(ir)
  const targets = ctx.adj.get(node.id) ?? []
  const nodeLabels = ctx.edgeLabels.get(node.id) ?? new Map()

  const findTarget = (label: string) => targets.find((t) => nodeLabels.get(t) === label)

  const lines: string[] = []

  // try block
  lines.push('try {')
  const tryTarget = findTarget('try')
  if (tryTarget) lines.push(inlineChain(tryTarget, ctx, generateNode, ir, 2))

  // catch block
  lines.push('} catch (err) {')
  const catchTarget = findTarget('catch')
  if (catchTarget) lines.push(inlineChain(catchTarget, ctx, generateNode, ir, 2))

  // optional finally block
  const finallyTarget = findTarget('finally')
  if (finallyTarget) {
    lines.push('} finally {')
    lines.push(inlineChain(finallyTarget, ctx, generateNode, ir, 2))
  }

  lines.push('}')
  return lines.join('\n')
}
