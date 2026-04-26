import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type { GenerateMode } from '@awaitstep/codegen'
import { generatePromiseContainer } from './container-utils.js'

export function generateRace(
  node: WorkflowNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
  mode: GenerateMode = 'workflow',
): string {
  return generatePromiseContainer(node, ir, 'race', generateNode, mode)
}
