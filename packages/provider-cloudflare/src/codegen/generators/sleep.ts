import type { WorkflowNode } from '@awaitstep/ir'
import { stepLabel } from '@awaitstep/codegen'

export function generateSleep(node: WorkflowNode): string {
  const duration = node.data.duration
  const formatted = typeof duration === 'string' ? `"${duration}"` : duration
  return `await step.sleep("${stepLabel(node)}", ${formatted});`
}

export function generateSleepUntil(node: WorkflowNode): string {
  const timestamp = String(node.data.timestamp ?? '')
  return `await step.sleepUntil("${stepLabel(node)}", new Date("${timestamp}"));`
}
