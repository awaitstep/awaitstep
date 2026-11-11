import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { stepLabel, type GenerateMode, type GenerationContext } from '../internal.js'
import { prepareContainerContext, inlineChain } from './container-utils.js'

export function generateWaitForEvent(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  generateNode: (node: WorkflowNode, ir: WorkflowIR, ctx?: GenerationContext) => string,
  mode: GenerateMode = 'workflow',
): string {
  const eventType = String(node.data.eventType ?? '')
  // Every wait has a timeout. Older nodes without one get the product default
  // rather than Cloudflare's much shorter runtime default.
  const timeout = node.data.timeout ?? '365 days'

  const containers = prepareContainerContext(ir)
  const labels = containers.edgeLabels.get(node.id)
  const targetFor = (label: string, field: string) => {
    // The selectors are the authored source; the edge is the canvas mirror.
    if (typeof node.data[field] === 'string' && node.data[field]) {
      return node.data[field] as string
    }
    for (const [target, edgeLabel] of labels ?? []) {
      if (edgeLabel === label) return target
    }
    return ''
  }
  const eventTarget = targetFor('onEvent', 'onEventNode')
  const timeoutTarget = targetFor('onTimeout', 'onTimeoutNode')

  const variable = ctx.varName(node.id)
  const eventCode = eventTarget
    ? inlineChain(eventTarget, containers, generateNode, ir, 2, ctx, mode)
    : ''
  const timeoutCode = timeoutTarget
    ? inlineChain(timeoutTarget, containers, generateNode, ir, 2, ctx, mode)
    : ''

  // The runtime owns the try/catch: it returns a sentinel on a timeout and
  // rethrows anything else. Only the wait itself is inside it, so an on-event
  // branch that throws (or a step inside it timing out) can never be mistaken
  // for this wait timing out, and the result is a plain const with no binding
  // left dangling outside the wait.
  //
  // A symbol marks the timeout arm: event payloads are JSON, so they can never
  // be a symbol.
  const lines = [
    `const ${variable} = await waitForEventOrTimeout(flow, "${stepLabel(node)}", {`,
    `  type: ${JSON.stringify(eventType)},`,
    `  timeout: ${typeof timeout === 'string' ? JSON.stringify(timeout) : timeout},`,
    '});',
    `if (typeof ${variable} === "symbol") {`,
    timeoutCode,
    '} else {',
    eventCode,
    '}',
  ]
  return lines.filter((line) => line !== '').join('\n')
}
