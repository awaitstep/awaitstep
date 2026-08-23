import { parseExpressions } from './parse.js'

/**
 * Identifiers that are runtime-provided (not node IDs) and should bypass
 * the upstream/exists checks in {@link validateExpressionRefs}:
 *
 * - `event` — the parameter to `WorkflowEntrypoint.run(event, step)` (workflow)
 *   and `runGraph(env, event)` (script). Used as `{{event.payload.X}}`.
 * - `env`   — the environment binding object. Used as `{{env.MY_VAR}}`; the
 *   codegen has dedicated env-var scanning for this prefix.
 * - `trigger` — alias used in some docs/examples for the trigger payload.
 */
export const RESERVED_EXPRESSION_REFS = new Set(['event', 'env', 'trigger'])

export interface ExpressionValidationError {
  expression: string
  nodeId: string
  message: string
}

/**
 * Validate that all expression references point to nodes that
 * are upstream (appear before) the current node in topological order.
 */
export function validateExpressionRefs(
  input: string,
  currentNodeId: string,
  upstreamNodeIds: Set<string>,
  allNodeIds: Set<string>,
): ExpressionValidationError[] {
  const errors: ExpressionValidationError[] = []
  const expressions = parseExpressions(input)

  for (const expr of expressions) {
    if (RESERVED_EXPRESSION_REFS.has(expr.nodeId)) continue
    if (expr.nodeId === currentNodeId) {
      errors.push({
        expression: expr.raw,
        nodeId: expr.nodeId,
        message: `Expression references the current node "${expr.nodeId}"`,
      })
    } else if (!allNodeIds.has(expr.nodeId)) {
      errors.push({
        expression: expr.raw,
        nodeId: expr.nodeId,
        message: `Expression references nonexistent node "${expr.nodeId}"`,
      })
    } else if (!upstreamNodeIds.has(expr.nodeId)) {
      errors.push({
        expression: expr.raw,
        nodeId: expr.nodeId,
        message: `Expression references downstream node "${expr.nodeId}"`,
      })
    }
  }

  return errors
}
