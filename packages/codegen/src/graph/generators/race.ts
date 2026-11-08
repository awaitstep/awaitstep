import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import type { GenerateMode, GenerationContext } from '../internal.js'
import { generatePromiseContainer } from './container-utils.js'

export function generateRace(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  generateNode: (node: WorkflowNode, ir: WorkflowIR, ctx?: GenerationContext) => string,
  mode: GenerateMode = 'workflow',
): string {
  return generatePromiseContainer(node, ir, ctx, 'race', generateNode, mode)
}
