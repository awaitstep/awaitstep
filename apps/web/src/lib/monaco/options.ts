import type { editor } from 'monaco-editor'

/**
 * The one editor look shared by every Monaco pane (node code, trigger code,
 * playground). Variants spread on top of this instead of redeclaring it.
 */
export const BASE_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  fontSize: 11,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  tabSize: 2,
  automaticLayout: true,
  padding: { top: 8, bottom: 8 },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  renderLineHighlight: 'none',
  scrollbar: { vertical: 'auto', horizontal: 'hidden', verticalScrollbarSize: 6 },
  lineNumbersMinChars: 3,
  folding: false,
  glyphMargin: false,
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
}

/** Read-only output viewers (generated code preview, IR JSON, responses). */
export const READONLY_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  ...BASE_EDITOR_OPTIONS,
  readOnly: true,
  domReadOnly: true,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  cursorStyle: 'line-thin',
}

/** Fullscreen editing surface — roomier type, minimap, folding. */
export const FULLSCREEN_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  ...BASE_EDITOR_OPTIONS,
  fontSize: 13,
  lineNumbersMinChars: 4,
  padding: { top: 16, bottom: 16 },
  minimap: { enabled: true },
  folding: true,
}
