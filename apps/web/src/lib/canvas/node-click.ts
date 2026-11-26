/** What the canvas shows when a node is clicked. */
export interface NodeClickState {
  clickedId: string
  selectedId: string | null
  /** The step inspector may show (the toolbar's choice). */
  inspectorOpen: boolean
  /** The code preview holds the inspector's space. */
  codePreviewOpen: boolean
}

/** Whether to select the clicked node, and the inspector's next state (null leaves it). */
export interface NodeClickEffect {
  select: boolean
  inspectorOpen: boolean | null
}

/**
 * A click on the selected node shows or hides its settings; a click on
 * another selects it and shows its settings. While the code preview is up
 * the inspector is behind it, so a click leaves the inspector as it is.
 */
export function nodeClickEffect(state: NodeClickState): NodeClickEffect {
  const same = state.clickedId === state.selectedId
  if (state.codePreviewOpen) return { select: !same, inspectorOpen: null }
  return same
    ? { select: false, inspectorOpen: !state.inspectorOpen }
    : { select: true, inspectorOpen: true }
}
