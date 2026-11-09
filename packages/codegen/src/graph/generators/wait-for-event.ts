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
  const timeoutPart = `, timeout: ${typeof timeout === 'string' ? JSON.stringify(timeout) : timeout}`

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
  const timedOut = `${variable}_timedOut`
  const eventCode = eventTarget
    ? inlineChain(eventTarget, containers, generateNode, ir, 2, ctx, mode)
    : ''
  const timeoutCode = timeoutTarget
    ? inlineChain(timeoutTarget, containers, generateNode, ir, 2, ctx, mode)
    : ''

  const lines = [
    `let ${variable};`,
    `let ${timedOut} = false;`,
    'try {',
    `  ${variable} = await flow.waitForEvent("${stepLabel(node)}", {`,
    `  type: ${JSON.stringify(eventType)}${timeoutPart}`,
    '  });',
    '} catch (err) {',
    '  if (',
    '    err instanceof Error &&',
    '    (err.name === "WorkflowTimeoutError" || err.message.includes("WorkflowTimeoutError"))',
    '  ) {',
    `    ${timedOut} = true;`,
    '  } else {',
    '    throw err;',
    '  }',
    '}',
    `if (${timedOut}) {`,
    timeoutCode,
    '} else {',
    eventCode,
    '}',
  ]
  return lines.filter((line) => line !== '').join('\n')
}
