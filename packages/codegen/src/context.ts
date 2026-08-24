import { buildVarNameMap, sanitizeIdentifier } from './sanitize.js'

/**
 * Per-generation state threaded through code generators. Replaces the old
 * module-global var-name map so concurrent and nested generations can never
 * observe each other's state.
 */
export interface GenerationContext {
  /** JavaScript variable name for a node's step result. */
  varName(nodeId: string): string
}

/**
 * Pure derivation of the node-id → variable-name map (variable names come
 * from node display names, deduplicated). Exposed separately so non-codegen
 * consumers (e.g. editor type-definition generation) can reuse the exact
 * naming scheme without constructing a context.
 */
export function computeVarNames(nodes: { id: string; name: string }[]): Map<string, string> {
  return buildVarNameMap(nodes)
}

export function createGenerationContext(nodes: { id: string; name: string }[]): GenerationContext {
  const names = computeVarNames(nodes)
  return {
    varName(nodeId: string): string {
      // Truthiness (not just nullish) check for exact parity with the old
      // global-map fallback: an empty mapped name falls back to the id.
      const name = names.get(nodeId)
      return name ? name : sanitizeIdentifier(nodeId)
    },
  }
}
