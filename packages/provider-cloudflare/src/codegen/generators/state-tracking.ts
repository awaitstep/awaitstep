import type { WorkflowNode } from '@awaitstep/ir'

export function hasTemplateExpressions(nodes: WorkflowNode[]): boolean {
  const pattern = /\{\{\w[\w-]*(?:\.\w[\w-]*)*\}\}/
  for (const node of nodes) {
    if (node.type === 'step' && pattern.test(node.code)) return true
    if (node.type === 'http-request') {
      if (pattern.test(node.url)) return true
      if (node.body && pattern.test(node.body)) return true
      if (node.headers) {
        for (const v of Object.values(node.headers)) {
          if (pattern.test(v)) return true
        }
      }
    }
    if (node.type === 'branch') {
      for (const b of node.branches) {
        if (b.condition && pattern.test(b.condition)) return true
      }
    }
    if (node.type === 'custom') {
      for (const v of Object.values(node.data)) {
        if (typeof v === 'string' && pattern.test(v)) return true
      }
    }
  }
  return false
}
