import type { WorkflowNode } from '@awaitstep/ir'

/** Nodes with more than one way out; every other node has exactly one exit. */
export const MULTI_EDGE_TYPES = new Set(['branch', 'parallel', 'try_catch', 'loop', 'race'])

export type ExitConnection = { allowed: false } | { allowed: true; label?: string }

/** The labels each container hands out to the edges drawn from it, in order. */
const ORDERED_LABELS: Partial<Record<string, readonly string[]>> = {
  loop: ['body', 'then'],
  try_catch: ['try', 'catch', 'finally', 'then'],
  // Per-branch wiring is set in the config panel; a drag from a branch is the
  // path that runs after the if/else block returns.
  branch: ['then'],
}

/**
 * Whether one more edge may leave `source`, and the label it gets. The one
 * rule behind both a drag between handles and a node added from a + on the
 * canvas, so the two can never disagree.
 */
export function exitConnection(
  source: Pick<WorkflowNode, 'type' | 'data'>,
  outgoing: readonly { label?: unknown }[],
): ExitConnection {
  if (!MULTI_EDGE_TYPES.has(source.type) && source.type !== 'break') {
    return outgoing.length > 0 ? { allowed: false } : { allowed: true }
  }
  if (source.type === 'break') {
    if (outgoing.length > 0) return { allowed: false }
    return String(source.data.condition ?? '').trim()
      ? { allowed: true, label: 'else' }
      : { allowed: true }
  }
  const order = ORDERED_LABELS[source.type]
  if (!order) return { allowed: true }
  const used = new Set(outgoing.map((e) => e.label))
  const label = order.find((l) => !used.has(l))
  return label ? { allowed: true, label } : { allowed: false }
}

/**
 * Whether a drag from `source` to `target` would do anything: move an edge
 * that already joins the two (to the sides dragged between), or add one the
 * source can still take. The canvas uses it to show a refused drag while it is
 * still being dragged; the store's `onConnect` applies the same rule.
 */
export function connectionFits(
  nodes: readonly { id: string; data: { irNode: WorkflowNode } }[],
  edges: readonly { source: string; target: string; label?: unknown }[],
  connection: { source: string; target: string },
): boolean {
  if (edges.some((e) => e.source === connection.source && e.target === connection.target)) {
    return true
  }
  const source = nodes.find((n) => n.id === connection.source)
  if (!source) return true
  const outgoing = edges.filter((e) => e.source === connection.source)
  return exitConnection(source.data.irNode, outgoing).allowed
}
