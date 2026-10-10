import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type { GenerateMode, GenerationContext } from '@awaitstep/codegen'
import { prepareContainerContext, inlineChain } from './container-utils.js'

export function generateTryCatch(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
  mode: GenerateMode = 'workflow',
): string {
  const containers = prepareContainerContext(ir)
  const targets = containers.adj.get(node.id) ?? []
  const nodeLabels = containers.edgeLabels.get(node.id) ?? new Map()

  const findTarget = (label: string) => targets.find((t) => nodeLabels.get(t) === label)

  const lines: string[] = []

  // try block
  lines.push('try {')
  const tryTarget = findTarget('try')
  if (tryTarget) lines.push(inlineChain(tryTarget, containers, generateNode, ir, 2, ctx, mode))

  // catch block
  lines.push('} catch (err) {')
  const catchTarget = findTarget('catch')
  if (catchTarget) lines.push(inlineChain(catchTarget, containers, generateNode, ir, 2, ctx, mode))

  // optional finally block
  const finallyTarget = findTarget('finally')
  if (finallyTarget) {
    lines.push('} finally {')
    lines.push(inlineChain(finallyTarget, containers, generateNode, ir, 2, ctx, mode))
  }

  lines.push('}')
  return lines.join('\n')
}
