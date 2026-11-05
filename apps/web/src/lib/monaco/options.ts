import type { editor } from 'monaco-editor'
import { CODE_FONT_FAMILY } from './code-font'

/**
 * The one editor look shared by every Monaco pane (node code, trigger code,
 * playground). Variants spread on top of this instead of redeclaring it.
 */
export const BASE_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  // Explicit, because `updateOptions` merges: a pane that toggles between
  // these and a read-only variant must be able to become writable again.
  readOnly: false,
  domReadOnly: false,
  minimap: { enabled: false },
  fontFamily: CODE_FONT_FAMILY,
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

/**
 * The IDE workspace editor group: a full editing surface with folding,
 * minimap, line highlight and horizontal scrolling instead of soft wrap.
 */
export const IDE_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  ...BASE_EDITOR_OPTIONS,
  fontSize: 12,
  lineNumbersMinChars: 4,
  padding: { top: 12, bottom: 12 },
  minimap: { enabled: true, renderCharacters: false },
  folding: true,
  glyphMargin: true,
  wordWrap: 'off',
  renderLineHighlight: 'line',
  overviewRulerLanes: 2,
  hideCursorInOverviewRuler: false,
  scrollbar: {
    vertical: 'auto',
    horizontal: 'auto',
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
}

/** IDE surface for files that cannot be edited in place (generated source). */
export const IDE_READONLY_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  ...IDE_EDITOR_OPTIONS,
  readOnly: true,
  domReadOnly: true,
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
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
