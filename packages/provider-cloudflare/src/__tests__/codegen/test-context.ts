import { createGenerationContext } from '@awaitstep/codegen'
import { generateNodeCode } from '../../codegen/generate.js'
import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'

/**
 * Fallback context shared by generator tests: var names derive from sanitized
 * node ids, matching the pre-context behavior the assertions were written
 * against.
 */
export const testCtx = createGenerationContext([])

/** generateNodeCode bound to the shared test context, in recurse-callback shape. */
export function recurseWithTestCtx(node: WorkflowNode, ir: WorkflowIR): string {
  return generateNodeCode(node, ir, testCtx)
}
