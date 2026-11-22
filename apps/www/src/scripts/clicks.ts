/** The parts of a click that say whether the visitor asked for a new tab or window. */
export interface ClickLike {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * A plain primary click: the one a page may take over (to open a dialog, say). A middle click, or
 * one with Cmd, Ctrl, Shift or Alt, means "open this elsewhere" and is left to the browser.
 */
export function isPlainClick(event: ClickLike): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
