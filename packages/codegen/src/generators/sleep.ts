import type { SleepNode, SleepUntilNode } from '@awaitstep/ir'

export function generateSleep(node: SleepNode): string {
  const duration = typeof node.duration === 'string' ? `"${node.duration}"` : node.duration
  return `await step.sleep("${escName(node.name)}", ${duration});`
}

export function generateSleepUntil(node: SleepUntilNode): string {
  return `await step.sleepUntil("${escName(node.name)}", new Date("${node.timestamp}"));`
}

function escName(name: string): string {
  return name.replace(/"/g, '\\"')
}
