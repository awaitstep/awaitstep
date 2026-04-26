import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type { GenerateMode } from '@awaitstep/codegen'
import { generatePromiseContainer } from './container-utils.js'

export function generateParallel(
  node: WorkflowNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
  mode: GenerateMode = 'workflow',
): string {
  return generatePromiseContainer(node, ir, 'allSettled', generateNode, mode)
}
