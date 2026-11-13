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
 * The node an expression ref names: a node id, else a node's variable name
 * (`sample_step`, the name a step's code reads as `inputs.sample_step`),
 * looked up in `idByName`. An id wins over a name. Unknown refs come back
 * as written.
 */
export function expressionRefNodeId(
  ref: string,
  allNodeIds: ReadonlySet<string>,
  idByName?: ReadonlyMap<string, string>,
): string {
  if (allNodeIds.has(ref)) return ref
  return idByName?.get(ref) ?? ref
}

/**
 * Validate that all expression references point to nodes that
 * are upstream (appear before) the current node in topological order.
 * A ref may be a node id or, given `idByName`, a node's variable name.
 */
export function validateExpressionRefs(
  input: string,
  currentNodeId: string,
  upstreamNodeIds: Set<string>,
  allNodeIds: Set<string>,
  idByName?: ReadonlyMap<string, string>,
): ExpressionValidationError[] {
  const errors: ExpressionValidationError[] = []
  const expressions = parseExpressions(input)

  for (const parsed of expressions) {
    if (RESERVED_EXPRESSION_REFS.has(parsed.nodeId)) continue
    const expr = { ...parsed, nodeId: expressionRefNodeId(parsed.nodeId, allNodeIds, idByName) }
    if (expr.nodeId === currentNodeId) {
      errors.push({
        expression: expr.raw,
        nodeId: expr.nodeId,
        message: `Expression references the current node "${parsed.nodeId}"`,
      })
    } else if (!allNodeIds.has(expr.nodeId)) {
      errors.push({
        expression: expr.raw,
        nodeId: expr.nodeId,
        message: `Expression references nonexistent node "${parsed.nodeId}"`,
      })
    } else if (!upstreamNodeIds.has(expr.nodeId)) {
      errors.push({
        expression: expr.raw,
        nodeId: expr.nodeId,
        message: `Expression references downstream node "${parsed.nodeId}"`,
      })
    }
  }

  return errors
}
