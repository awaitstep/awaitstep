import { useIdeStore } from '../../stores/ide-store'
import { filePathOfTab } from './tabs'

/**
 * Gives the keyboard to the file editor. When a file is the active tab the
 * editor may still be mounting for it (coming from the Review or Compare tab,
 * or from no tab at all), so the request waits in the store and the editor
 * takes it once it shows that file. Otherwise the open diff's editor, if any,
 * is focused directly.
 */
export function focusEditor(): void {
  const ide = useIdeStore.getState()
  if (filePathOfTab(ide.activePath) !== null) ide.requestEditorFocus()
  else ide.editorHandle?.focus()
}

/**
 * The same once the screen has settled. For actions that remove the button
 * that was pressed: focus would otherwise fall to the page, and the next
 * keystroke would go nowhere.
 */
export function focusEditorSoon(): void {
  requestAnimationFrame(focusEditor)
}
