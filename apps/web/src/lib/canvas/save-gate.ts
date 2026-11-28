export interface CanvasSaveState {
  readOnly: boolean
  isSaving: boolean
  isDirty: boolean
  saveConflict: boolean
}

/**
 * Whether the canvas can save now. The toolbar's Save button and the ⌘S and
 * ⌘↵ keys all read this one rule, so a key never saves when the button is
 * off: nothing changed, a save is running, Code moved the workflow, or it is
 * read-only.
 */
export function canSaveCanvas(state: CanvasSaveState): boolean {
  return !state.readOnly && !state.isSaving && !state.saveConflict && state.isDirty
}
