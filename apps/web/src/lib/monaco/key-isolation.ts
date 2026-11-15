/**
 * React Flow's opt-out class: page-wide keys pressed inside an element
 * carrying it are not the graph's (Space to pan, Backspace to delete the
 * selection; modifier keys still reach it, which is harmless). React Flow
 * only recognises inputs, textareas and `contenteditable` elements as typing,
 * and Monaco's EditContext input (a plain `div.native-edit-context`) is none
 * of these.
 */
export const NO_GRAPH_KEYS_CLASS = 'nokey'

type EditorLike = { getContainerDomNode(): HTMLElement }

interface EditorRegistry {
  onDidCreateEditor(listener: (editor: EditorLike) => void): unknown
  getEditors(): readonly EditorLike[]
}

const watched = new WeakSet<EditorRegistry>()

function mark(editor: EditorLike): void {
  editor.getContainerDomNode().classList.add(NO_GRAPH_KEYS_CLASS)
}

/**
 * Marks every editor of this Monaco instance, so typing in one never reaches
 * a React Flow graph on the same page: the ones that already exist (a
 * DiffEditor creates its editors before calling `beforeMount`) and every one
 * created afterwards. Idempotent per instance; every `beforeMount` setup
 * calls it.
 */
export function keepKeysInEditors(monaco: { editor: EditorRegistry }): void {
  if (watched.has(monaco.editor)) return
  watched.add(monaco.editor)
  monaco.editor.getEditors().forEach(mark)
  monaco.editor.onDidCreateEditor(mark)
}
