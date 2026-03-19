import type { WorkflowNode } from '@awaitstep/ir'

export function hasTemplateExpressions(nodes: WorkflowNode[]): boolean {
  const pattern = /\{\{\w[\w-]*(?:\.\w[\w-]*)*\}\}/
  for (const node of nodes) {
    for (const v of Object.values(node.data)) {
      if (typeof v === 'string' && pattern.test(v)) return true
    }
  }
  return false
}
