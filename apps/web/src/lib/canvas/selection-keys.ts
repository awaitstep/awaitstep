import type { NodeSelectionChange } from '@xyflow/react'

interface SelectableNode {
  id: string
  selected?: boolean
}

/** ⌘A: every step selected, as React Flow's own select changes. */
export function selectAllChanges(nodes: readonly SelectableNode[]): NodeSelectionChange[] {
  return nodes.filter((n) => !n.selected).map((n) => ({ type: 'select', id: n.id, selected: true }))
}

/**
 * Esc: the selected steps let go. Empty when nothing is selected and no
 * step's settings are open, so Esc stays with whoever else wants it.
 */
export function clearSelectionChanges(nodes: readonly SelectableNode[]): NodeSelectionChange[] {
  return nodes.filter((n) => n.selected).map((n) => ({ type: 'select', id: n.id, selected: false }))
}
