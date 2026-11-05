import type { Monaco } from '@monaco-editor/react'

/** The code font (D6): JetBrains Mono, with the platform monospace stack as fallback. */
export const CODE_FONT_FAMILY =
  "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"

let remeasured = new WeakSet<object>()

/**
 * Monaco measures glyph widths once, so a font that arrives later leaves the
 * cursor and selections misaligned. Waits for the code font, then asks Monaco
 * to measure again. Safe to call from every editor setup; runs once per Monaco.
 */
export function remeasureWhenCodeFontLoads(monaco: Pick<Monaco, 'editor'>): Promise<void> {
  if (remeasured.has(monaco) || typeof document === 'undefined' || !document.fonts) {
    return Promise.resolve()
  }
  remeasured.add(monaco)
  return document.fonts
    .load(`12px ${CODE_FONT_FAMILY}`)
    .then(() => monaco.editor.remeasureFonts())
    .catch(() => {})
}

/** Test seam. */
export function resetRemeasured(): void {
  remeasured = new WeakSet<object>()
}
