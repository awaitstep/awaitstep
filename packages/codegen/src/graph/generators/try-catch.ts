import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import {
  CATCH_BINDINGS,
  CATCH_ERROR_VAR,
  childContext,
  type GenerateMode,
  type GenerationContext,
} from '../internal.js'
import { prepareContainerContext, inlineChain } from './container-utils.js'

export function generateTryCatch(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  generateNode: (node: WorkflowNode, ir: WorkflowIR, ctx?: GenerationContext) => string,
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

  // catch block: a step in it reads the caught error as `inputs.error`.
  lines.push(`} catch (${CATCH_ERROR_VAR}) {`)
  const catchTarget = findTarget('catch')
  if (catchTarget) {
    const catchCtx = childContext(ctx, CATCH_BINDINGS)
    lines.push(inlineChain(catchTarget, containers, generateNode, ir, 2, ctx, mode, catchCtx))
  }

  // optional finally block
  const finallyTarget = findTarget('finally')
  if (finallyTarget) {
    lines.push('} finally {')
    lines.push(inlineChain(finallyTarget, containers, generateNode, ir, 2, ctx, mode))
  }

  lines.push('}')
  return lines.join('\n')
}
