import type { WorkflowNode } from '@awaitstep/ir'
import { varName } from '@awaitstep/codegen'

export function generateStateInit(): string {
  return `const _workflowState: Record<string, any> = {};`
}

export function generateStateCapture(node: WorkflowNode): string | null {
  switch (node.type) {
    case 'step': {
      if (!/\breturn\b/.test(node.code)) return null
      return `_workflowState['${node.id}'] = ${varName(node.id)};`
    }
    case 'http-request':
    case 'wait-for-event':
      return `_workflowState['${node.id}'] = ${varName(node.id)};`
    default:
      return null
  }
}

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
  }
  return false
}
