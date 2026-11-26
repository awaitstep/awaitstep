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

/**
 * What Esc does on the canvas: `decline` when there is nothing to let go of
 * (Esc stays with whoever else wants it); `stay` when the open step has
 * errors and may not be left, as a click on the pane would find; else `clear`.
 */
export function escapeOutcome(input: {
  selectedSteps: number
  openStep: boolean
  selectedEdge: boolean
  canLeave: () => boolean
}): 'decline' | 'stay' | 'clear' {
  if (input.selectedSteps === 0 && !input.openStep && !input.selectedEdge) return 'decline'
  if (input.openStep && !input.canLeave()) return 'stay'
  return 'clear'
}
