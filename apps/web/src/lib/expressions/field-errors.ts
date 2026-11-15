import { expressionScopes, insertNode, type StepPlacement } from '@awaitstep/codegen'
import {
  codeFieldsOf,
  nodeExpressionProblems,
  type ConfigField,
  type ArtifactIR,
  type ExpressionScope,
  type WorkflowNode,
} from '@awaitstep/ir'

/** The graph a node's fields are judged in: its nodes and connections. */
export interface ExpressionGraph {
  nodes: Iterable<Pick<WorkflowNode, 'id' | 'name'>>
  edges: readonly { id?: string; source: string; target: string; label?: string }[]
}

/**
 * What a node not placed yet may name: the graph with it inserted where the
 * person chose. When that place can't take it, refs are not judged (the
 * insert itself says why); a malformed `{{ … }}` still is.
 */
export function scopeForNewNode(
  graph: ExpressionGraph & { entryNodeId: string | null },
  placement: StepPlacement | null,
  node: { id: string; name: string; type: string },
): ExpressionScope {
  const nodes = [...graph.nodes] as WorkflowNode[]
  const lenient: ExpressionScope = {
    nodeId: node.id,
    upstream: { has: () => true },
    allNodeIds: { has: () => true },
  }
  if (placement === null) return lenient
  const doc = {
    nodes,
    // The ids the placement names are kept; an edge given none gets one.
    edges: graph.edges.map((edge, index) => ({ ...edge, id: edge.id ?? `edge-${index}` })),
    entryNodeId: graph.entryNodeId ?? '',
  } as unknown as ArtifactIR
  const inserted = insertNode(doc, placement, { ...node, name: node.name.trim() || 'New node' })
  if (!inserted.ok) return lenient
  return expressionScopes(inserted.ir.nodes, inserted.ir.edges).scopeOf(node.id)
}

/** The first expression problem in each field, by field id, as the fields show them. */
export function fieldExpressionErrors(
  data: Readonly<Record<string, unknown>>,
  scope: ExpressionScope,
  configSchema?: Readonly<Record<string, ConfigField>>,
  type?: string,
): Record<string, string> {
  // No prototype: a field named like `constructor` reads as its own entry.
  const errors: Record<string, string> = Object.create(null)
  for (const problem of nodeExpressionProblems(data, scope, codeFieldsOf(configSchema, type))) {
    errors[problem.field] ??= problem.message
  }
  return errors
}
