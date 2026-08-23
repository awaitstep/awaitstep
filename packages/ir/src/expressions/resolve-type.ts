import type { ArtifactIR } from '../types.js'
import type { NodeDefinition, OutputField } from '../node-definition.js'
import type { ExpressionAST } from './parse.js'
import { RESERVED_EXPRESSION_REFS } from './refs.js'

/** The subset of NodeRegistry resolve-type needs — anything with get(). */
export interface NodeDefinitionLookup {
  get(nodeType: string): NodeDefinition | undefined
}

/**
 * Resolves the static type of an expression by walking the referenced node's
 * `outputSchema`. Returns undefined when the type cannot be determined —
 * reserved refs (event/env/trigger are runtime-shaped), unknown nodes, nodes
 * without an output schema, or paths that leave the declared shape. A defined
 * result powers editor completions, hovers, and binding pickers.
 */
export function resolveExpressionType(
  ast: ExpressionAST,
  ir: ArtifactIR,
  registry: NodeDefinitionLookup,
): OutputField | undefined {
  if (RESERVED_EXPRESSION_REFS.has(ast.ref)) return undefined

  const node = ir.nodes.find((n) => n.id === ast.ref)
  if (!node) return undefined

  const definition = registry.get(node.type)
  if (!definition?.outputSchema || Object.keys(definition.outputSchema).length === 0) {
    return undefined
  }

  let current: OutputField = { type: 'object', properties: definition.outputSchema }
  for (const segment of ast.segments) {
    if (segment.kind === 'index') {
      if (current.type !== 'array' || !current.items) return undefined
      current = current.items
    } else {
      const key = segment.kind === 'prop' ? segment.name : segment.value
      if (current.type !== 'object' || !current.properties) return undefined
      const next = current.properties[key]
      if (!next) return undefined
      current = next
    }
  }
  return current
}
