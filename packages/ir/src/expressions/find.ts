import type { WorkflowNode } from '../types.js'
import type { ExpressionSpan } from './parse.js'
import { scanExpressions } from './parse.js'

export interface FoundExpression extends ExpressionSpan {
  /** data key holding the string the expression was found in. */
  dataKey: string
  /** For strings inside array-of-object fields (e.g. branch arms): the element index and key. */
  arrayIndex?: number
  arrayKey?: string
}

/**
 * Finds every expression in a node's `data`, walking top-level strings plus
 * one level of array-of-objects/strings — the exact surface codegen resolves
 * (see provider resolveNodeExpressions), so what this finds is what runs.
 */
export function findExpressions(node: WorkflowNode): FoundExpression[] {
  const found: FoundExpression[] = []
  for (const [key, value] of Object.entries(node.data)) {
    if (typeof value === 'string') {
      for (const span of scanExpressions(value)) found.push({ ...span, dataKey: key })
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'string') {
          for (const span of scanExpressions(item)) {
            found.push({ ...span, dataKey: key, arrayIndex: index })
          }
        } else if (item !== null && typeof item === 'object') {
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
            if (typeof v !== 'string') continue
            for (const span of scanExpressions(v)) {
              found.push({ ...span, dataKey: key, arrayIndex: index, arrayKey: k })
            }
          }
        }
      })
    }
  }
  return found
}

/**
 * True when any string on the resolution surface contains a valid expression:
 * top-level strings plus one level of array-of-objects/strings (branch arms).
 * Plain nested objects (e.g. http headers) are not scanned — codegen never
 * resolves those, so they must not flip the state-tracking mode either.
 * Kept in lockstep with {@link findExpressions}: the gate and the resolver
 * must always agree on what counts as an expression, or expressions ship as
 * literal text in generated code.
 */
export function containsExpressions(node: WorkflowNode): boolean {
  return findExpressions(node).length > 0
}
