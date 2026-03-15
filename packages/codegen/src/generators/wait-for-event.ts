import type { WaitForEventNode } from '@awaitstep/ir'

export function generateWaitForEvent(node: WaitForEventNode): string {
  const timeoutPart = node.timeout
    ? `, timeout: ${typeof node.timeout === 'string' ? `"${node.timeout}"` : node.timeout}`
    : ''

  return `const ${varName(node.id)} = await step.waitForEvent("${escName(node.name)}", {
  type: "${node.eventType}"${timeoutPart}
});`
}

function varName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

function escName(name: string): string {
  return name.replace(/"/g, '\\"')
}
