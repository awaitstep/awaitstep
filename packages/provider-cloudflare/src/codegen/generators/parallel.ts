import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generatePromiseContainer } from './container-utils.js'

export function generateParallel(
  node: WorkflowNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
): string {
  return generatePromiseContainer(node, ir, 'allSettled', generateNode)
}
