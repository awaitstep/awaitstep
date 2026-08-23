import type { ExpressionAST, ExpressionLiteral } from './parse.js'
import { scanExpressions } from './parse.js'

const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function literalToJs(literal: ExpressionLiteral): string {
  return JSON.stringify(literal.kind === 'null' ? null : literal.value)
}

/**
 * Compiles a parsed expression to the JavaScript that accesses the value.
 *
 * @param nameResolver - Maps the expression ref (node id or reserved ref like
 *   `env`/`event`) to its JavaScript variable reference.
 */
export function compileExpression(
  ast: ExpressionAST,
  nameResolver: (ref: string) => string = (ref) => ref,
): string {
  let js = nameResolver(ast.ref)
  for (const segment of ast.segments) {
    if (segment.kind === 'prop') {
      // Digit-prefixed words like `0th` parse as props but are not valid JS
      // dot access — emit bracket access so the generated code stays valid.
      js += JS_IDENTIFIER.test(segment.name)
        ? `.${segment.name}`
        : `[${JSON.stringify(segment.name)}]`
    } else if (segment.kind === 'index') js += `[${segment.value}]`
    else js += `[${JSON.stringify(segment.value)}]`
  }
  if (ast.fallback) {
    return `(${js} ?? ${literalToJs(ast.fallback)})`
  }
  return js
}

/**
 * Resolve template expressions in a string, replacing {{nodeId.path}}
 * with the JavaScript expression to access a previous step's return value.
 *
 * Identifier-path expressions produce byte-identical output to the v1 regex
 * substitution; the v2 grammar adds `[index]` / `["key"]` access (numeric
 * dot-segments like `.0` also compile to `[0]`, which v1 emitted as invalid
 * JS) and `?? literal` fallbacks, which compile to nullish coalescing.
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
  const spans = scanExpressions(input)
  if (spans.length === 0) return input

  let out = ''
  let cursor = 0
  for (const span of spans) {
    const compiled = compileExpression(span.ast, nameResolver)
    out += input.slice(cursor, span.start)
    out += context === 'interpolation' ? `\${${compiled}}` : compiled
    cursor = span.end
  }
  out += input.slice(cursor)
  return out
}
