import { useMemo } from 'react'
import type { ConfigField } from '@awaitstep/ir'
import { useShallow } from 'zustand/react/shallow'
import { expressionScopes } from '@awaitstep/codegen'
import { fieldExpressionErrors } from '../lib/expressions/field-errors'
import { useWorkflowStore } from '../stores/workflow-store'

const NONE: Readonly<Record<string, string>> = Object.freeze(Object.create(null))

/**
 * The `{{ … }}` problems in a placed node's field values, by field id, judged
 * against the graph on screen (the canvas's, which Code's Steps view shares):
 * an expression that isn't valid, or names a step that is missing, runs
 * later or is the node itself. Empty for a node not in the graph.
 */
export function useNodeExpressionErrors(
  nodeId: string | undefined,
  data: Readonly<Record<string, unknown>>,
  configSchema?: Readonly<Record<string, ConfigField>>,
): Readonly<Record<string, string>> {
  const { nodes, edges } = useWorkflowStore(useShallow((s) => ({ nodes: s.nodes, edges: s.edges })))
  const scopes = useMemo(
    () =>
      expressionScopes(
        nodes.map((node) => ({ id: node.id, name: node.data.irNode.name })),
        edges,
      ),
    [nodes, edges],
  )
  const type =
    nodeId === undefined ? undefined : nodes.find((node) => node.id === nodeId)?.data.irNode.type
  return useMemo(
    () =>
      type !== undefined
        ? fieldExpressionErrors(data, scopes.scopeOf(nodeId!), configSchema, type)
        : NONE,
    [type, data, scopes, nodeId, configSchema],
  )
}
