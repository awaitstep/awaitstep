import type { WorkflowNode } from '@awaitstep/ir'

// Tracks whether we're currently generating code inside a loop body.
// Incremented by generateLoop before body codegen, decremented after.
let loopDepth = 0

export function enterLoop(): void {
  loopDepth++
}

export function exitLoop(): void {
  loopDepth--
}

export function generateBreak(node: WorkflowNode): string {
  const condition = node.data.condition as string | undefined
  const keyword = loopDepth > 0 ? 'break' : 'return'
  if (condition && condition.trim()) {
    return `if (${condition.trim()}) ${keyword};`
  }
  return `${keyword};`
}
