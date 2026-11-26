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
export function isCanvasEvent(e: Event): boolean {
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

/** How long after ⌘V a paste event is that keystroke's, ms. */
const KEY_PASTE_WINDOW_MS = 1000

/**
 * One paste per ⌘V. The keystroke pastes either through the browser's paste
 * event or, when none comes, through the clipboard API a tick later; the
 * event can land after that tick, and would paste the nodes a second time.
 * Whichever comes first takes the keystroke. A paste event with no ⌘V
 * before it (the browser's Edit menu) always pastes.
 */
export function createPasteGate(now: () => number = Date.now) {
  let keyAt = Number.NEGATIVE_INFINITY
  let taken = true
  return {
    /** ⌘V was pressed: its paste is still to come. */
    keyPressed(): void {
      keyAt = now()
      taken = false
    },
    /** Whether a paste event may paste. */
    takeEvent(): boolean {
      if (!taken) {
        taken = true
        return true
      }
      return now() - keyAt > KEY_PASTE_WINDOW_MS
    },
    /** Whether the clipboard API may paste for the ⌘V: no event took it. */
    takeFallback(): boolean {
      if (taken) return false
      taken = true
      return true
    },
  }
}
