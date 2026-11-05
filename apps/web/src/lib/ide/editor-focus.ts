import { useIdeStore } from '../../stores/ide-store'

/**
 * Gives the keyboard to the open editor (or the right side of a diff) once
 * the screen has settled. For actions that remove the button that was
 * pressed: focus would otherwise fall to the page, and the next keystroke
 * would go nowhere.
 */
export function focusEditorSoon(): void {
  requestAnimationFrame(() => useIdeStore.getState().editorHandle?.focus())
}
