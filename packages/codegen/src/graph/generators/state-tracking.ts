import type { WorkflowNode } from '@awaitstep/ir'
import { containsExpressions } from '@awaitstep/ir'

export function hasTemplateExpressions(nodes: WorkflowNode[]): boolean {
  return nodes.some(containsExpressions)
}
