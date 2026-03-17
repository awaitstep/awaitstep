/**
 * Template expression parser and validator for workflow data flow.
 *
 * Expression format: {{nodeId.property.path}}
 * References the output of an upstream node.
 */

const EXPRESSION_PATTERN = /\{\{(\w[\w-]*(?:\.\w[\w-]*)*)\}\}/g

export interface ParsedExpression {
  raw: string
  nodeId: string
  path: string[]
}

/**
 * Parse all template expressions from a string.
 * Returns an array of parsed expressions with nodeId and property path.
 */
export function parseExpressions(input: string): ParsedExpression[] {
  const results: ParsedExpression[] = []
  let match: RegExpExecArray | null

  const pattern = new RegExp(EXPRESSION_PATTERN.source, 'g')
  while ((match = pattern.exec(input)) !== null) {
    const parts = match[1]!.split('.')
    results.push({
      raw: match[0],
      nodeId: parts[0]!,
      path: parts.slice(1),
    })
  }
  return results
}

/**
 * Resolve template expressions in a string, replacing {{nodeId.path}}
 * with the JavaScript expression to access a previous step's return value.
 *
 * @param nameResolver - Maps a node ID to its JavaScript variable reference.
 *   Defaults to the node ID itself (safe when variable names match node IDs).
 * @param context - 'code' (default) produces a bare reference; 'interpolation'
 *   wraps the reference in `${}` for use inside template literal strings.
 */
export function resolveExpressions(
  input: string,
  nameResolver: (nodeId: string) => string = (id) => id,
  context: 'code' | 'interpolation' = 'code',
): string {
  return input.replace(EXPRESSION_PATTERN, (_match, expr: string) => {
    const parts = expr.split('.')
    const nodeId = parts[0]!
    const path = parts.slice(1)
    const accessor = path.length > 0 ? `.${path.join('.')}` : ''
    const ref = `${nameResolver(nodeId)}${accessor}`
    return context === 'interpolation' ? `\${${ref}}` : ref
  })
}

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
