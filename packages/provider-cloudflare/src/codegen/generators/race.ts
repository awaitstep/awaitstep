import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { generatePromiseContainer } from './container-utils.js'

export function generateRace(
  node: WorkflowNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
): string {
  return generatePromiseContainer(node, ir, 'race', generateNode)
}
