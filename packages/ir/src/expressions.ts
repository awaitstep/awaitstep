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
 * with the JavaScript expression to access the workflow state.
 *
 * In 'code' context (default): {{x.y}} → _workflowState['x'].y
 * In 'interpolation' context: {{x.y}} → ${_workflowState['x'].y}
 *   (for embedding inside template literal strings like HTTP urls/headers/body)
 */
export function resolveExpressions(
  input: string,
  stateVar = '_workflowState',
  context: 'code' | 'interpolation' = 'code',
): string {
  return input.replace(EXPRESSION_PATTERN, (_match, expr: string) => {
    const parts = expr.split('.')
    const nodeId = parts[0]!
    const path = parts.slice(1)
    const accessor = path.length > 0 ? `.${path.join('.')}` : ''
    const ref = `${stateVar}['${nodeId}']${accessor}`
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
