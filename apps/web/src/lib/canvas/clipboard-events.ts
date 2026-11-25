import { isTypingTarget } from '../typing-target'

/**
 * The canvas's ⌘C and ⌘V, through the browser's own copy and paste events:
 * those carry the clipboard with no permission, on plain http too, where the
 * clipboard API is missing or refused.
 */
export interface CanvasClipboard {
  /** The selected nodes as clipboard text, or null with none selected. */
  copySelection: () => string | null
  /** New node ids from pasted text: none when it holds no copied nodes. */
  paste: (text: string) => string[]
  readOnly: boolean
}

/** Whether the event is the canvas's: not typed in a field, not in a dialog above it. */
function isCanvasEvent(e: Event): boolean {
  if (isTypingTarget(e.target)) return false
  return !(e.target instanceof Element && e.target.closest('[role="dialog"]'))
}

/** Puts the selected nodes on the clipboard; returns what it copied, or null. */
export function copyOnCanvas(
  e: ClipboardEvent,
  canvas: CanvasClipboard,
  selectedText: string,
): string | null {
  // Text the person selected on the page copies as usual.
  if (!e.clipboardData || !isCanvasEvent(e) || selectedText) return null
  const text = canvas.copySelection()
  if (!text) return null
  e.preventDefault()
  e.clipboardData.setData('text/plain', text)
  return text
}

/** Pastes copied nodes from the clipboard; returns the new ids (none leaves the paste alone). */
export function pasteOnCanvas(e: ClipboardEvent, canvas: CanvasClipboard): string[] {
  if (canvas.readOnly || !e.clipboardData || !isCanvasEvent(e)) return []
  const newIds = canvas.paste(e.clipboardData.getData('text/plain'))
  if (newIds.length > 0) e.preventDefault()
  return newIds
}
