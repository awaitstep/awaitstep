import type { editor } from 'monaco-editor'

/**
 * The single-line selection, else the word at the caret. Null while the
 * editor lacks focus, unless `ignoreFocus`: the palette has the keyboard
 * when its command runs, but the editor still holds its selection.
 */
export function searchSeedOf(instance: editor.ICodeEditor, ignoreFocus = false): string | null {
  if (!ignoreFocus && !instance.hasTextFocus()) return null
  const model = instance.getModel()
  const selection = instance.getSelection()
  if (!model || !selection) return ''
  if (!selection.isEmpty()) {
    return selection.startLineNumber === selection.endLineNumber
      ? model.getValueInRange(selection)
      : ''
  }
  return model.getWordAtPosition(selection.getPosition())?.word ?? ''
}
