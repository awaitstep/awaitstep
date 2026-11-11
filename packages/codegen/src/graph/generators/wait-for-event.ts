import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { collectChain, stepLabel, type GenerateMode, type GenerationContext } from '../internal.js'
import { armContext, inlineChain, prepareContainerContext, joinTarget } from './container-utils.js'

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
  // When both arms fall into one node, that node runs on either path: emit it
  // inside each arm, with that arm's own scope, instead of after the if/else
  // where a value created inside one arm would be out of scope.
  const join = joinTarget(containers, [eventTarget, timeoutTarget])
  const armCode = (target: string): string => {
    if (!target) return ''
    const code = inlineChain(target, containers, generateNode, ir, 2, ctx, mode)
    if (!join) return code
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
    return [code, merged].filter(Boolean).join('\n')
  }
  const eventCode = armCode(eventTarget)
  const timeoutCode = armCode(timeoutTarget)

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
