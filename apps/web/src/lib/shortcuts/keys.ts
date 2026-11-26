export interface ShortcutKeys {
  /** Printable key, compared case-insensitively against `KeyboardEvent.key`. */
  key?: string
  /**
   * Physical key (`KeyboardEvent.code`) for chords whose `key` changes with
   * modifiers — Shift turns `]` into `}`, Option on macOS turns `w` into `∑`.
   */
  code?: string
  /** ⌘ on macOS, Ctrl elsewhere. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export interface KeyEventLike {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  /** Present on real keyboard events; lets AltGr (reported as Ctrl+Alt on Windows) be told apart. */
  getModifierState?: (key: string) => boolean
}

export function matchesShortcut(event: KeyEventLike, keys: ShortcutKeys, isMac: boolean): boolean {
  const mod = isMac ? event.metaKey : event.ctrlKey
  const foreignMod = isMac ? event.ctrlKey : event.metaKey
  if (foreignMod || Boolean(keys.mod) !== mod) return false
  if (Boolean(keys.shift) !== event.shiftKey) return false
  if (Boolean(keys.alt) !== event.altKey) return false
  // AltGr types characters on many layouts (AltGr+S is "ś" in Polish); it is not a chord.
  if (keys.alt && !isMac && event.getModifierState?.('AltGraph')) return false
  if (keys.code) return event.code === keys.code
  return keys.key !== undefined && event.key.toLowerCase() === keys.key
}

const CODE_LABELS: Record<string, string> = {
  BracketRight: ']',
  BracketLeft: '[',
}

const KEY_LABELS: Record<string, { mac: string; other: string }> = {
  escape: { mac: 'Esc', other: 'Esc' },
  backspace: { mac: '⌫', other: 'Backspace' },
  enter: { mac: '⏎', other: 'Enter' },
}

function keyLabel(keys: ShortcutKeys, isMac: boolean): string {
  if (keys.code === 'Enter') return isMac ? '⏎' : 'Enter'
  if (keys.code) return CODE_LABELS[keys.code] ?? keys.code.replace(/^Key/, '')
  const named = keys.key ? KEY_LABELS[keys.key] : undefined
  if (named) return isMac ? named.mac : named.other
  return (keys.key ?? '').toUpperCase()
}

/** Human-readable binding, in each platform's conventional modifier order. */
export function formatShortcut(keys: ShortcutKeys, isMac: boolean): string {
  if (isMac) {
    return [keys.alt && '⌥', keys.shift && '⇧', keys.mod && '⌘', keyLabel(keys, isMac)]
      .filter(Boolean)
      .join('')
  }
  return [keys.mod && 'Ctrl', keys.alt && 'Alt', keys.shift && 'Shift', keyLabel(keys, isMac)]
    .filter(Boolean)
    .join('+')
}
