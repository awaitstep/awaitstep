import type { WaitForEventNode } from '@awaitstep/ir'
import { varName, escName } from '@awaitstep/codegen'

export function generateWaitForEvent(node: WaitForEventNode): string {
  const timeoutPart = node.timeout
    ? `, timeout: ${typeof node.timeout === 'string' ? `"${node.timeout}"` : node.timeout}`
    : ''

  return `const ${varName(node.id)} = await step.waitForEvent("${escName(node.name)}", {
  type: "${node.eventType}"${timeoutPart}
});`
}
