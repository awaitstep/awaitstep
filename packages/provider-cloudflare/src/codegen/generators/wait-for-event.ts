import type { WorkflowNode } from '@awaitstep/ir'
import { escName, type GenerationContext } from '@awaitstep/codegen'

export function generateWaitForEvent(node: WorkflowNode, ctx: GenerationContext): string {
  const eventType = String(node.data.eventType ?? '')
  const timeout = node.data.timeout

  const timeoutPart = timeout
    ? `, timeout: ${typeof timeout === 'string' ? `"${timeout}"` : timeout}`
    : ''

  return `const ${ctx.varName(node.id)} = await step.waitForEvent("${escName(node.name)}", {
  type: "${eventType}"${timeoutPart}
});`
}
