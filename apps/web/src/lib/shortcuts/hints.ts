import { formatShortcut } from './keys'
import { APP_SHORTCUTS, type AppShortcut, type AppShortcutId } from './registry'

/** One way to press a shortcut, as key caps: a chord is one cap, `g` then `p` two. */
export type KeyPresses = string[]

export function shortcutPresses(shortcut: AppShortcut, isMac: boolean): KeyPresses {
  if (shortcut.sequence) return shortcut.sequence.map((key) => key.toUpperCase())
  return shortcut.keys ? [formatShortcut(shortcut.keys, isMac)] : []
}

/** A button's tooltip with its key: "Deploy (D)", "Save (⌘S)", "Runs (G then U)". */
export function withShortcutHint(text: string, id: AppShortcutId, isMac: boolean): string {
  return `${text} (${shortcutPresses(APP_SHORTCUTS[id], isMac).join(' then ')})`
}
