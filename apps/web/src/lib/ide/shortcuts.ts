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

export type IdeShortcutId =
  | 'save'
  | 'saveAll'
  | 'newFile'
  | 'quickOpen'
  | 'commandPalette'
  | 'toggleExplorer'
  | 'toggleDock'
  | 'togglePreview'
  | 'nextTab'
  | 'prevTab'
  | 'closeTab'
  | 'run'
  | 'findInFiles'
  | 'nextSearchHit'
  | 'prevSearchHit'

/**
 * Workspace key bindings. Combos the browser or the platform owns outright
 * are avoided: ⌘W and Ctrl+Tab, but also Ctrl+Shift+V, which is paste as
 * plain text on Windows and Linux — this listener runs in the capture phase,
 * so binding it there would have stopped paste working anywhere in the IDE.
 * Tab cycling mirrors VS Code's ⇧⌘] / ⇧⌘[, and the preview takes VS Code's
 * secondary-side-bar chord, a sibling of ⌘B for the explorer.
 */
export const IDE_SHORTCUTS: Readonly<Record<IdeShortcutId, ShortcutKeys>> = {
  save: { key: 's', mod: true },
  // Option rewrites the glyph on macOS (⌥S types ß), so match the physical key.
  saveAll: { code: 'KeyS', mod: true, alt: true },
  // Option rewrites the glyph on macOS (⌥N is a dead key), so match the physical key.
  newFile: { code: 'KeyN', mod: true, alt: true },
  quickOpen: { key: 'p', mod: true },
  commandPalette: { key: 'p', mod: true, shift: true },
  toggleExplorer: { key: 'b', mod: true },
  toggleDock: { key: 'j', mod: true },
  togglePreview: { code: 'KeyB', mod: true, alt: true },
  nextTab: { code: 'BracketRight', mod: true, shift: true },
  prevTab: { code: 'BracketLeft', mod: true, shift: true },
  closeTab: { code: 'KeyW', mod: true, alt: true },
  // Option+Enter types nothing useful, but the physical key keeps it layout-proof.
  run: { code: 'Enter', alt: true },
  // VS Code's chord for Search. Unverified in browsers: Chrome, Firefox and
  // Safari on macOS and Chrome on Windows have yet to be checked for ones
  // that keep it from the page; the palette and the Search tab cover that.
  findInFiles: { key: 'f', mod: true, shift: true },
  // Step through search hits from the editor, as in VS Code. F4 is unchecked
  // in browsers for the same reason as above. The handler declines the key
  // when there is nothing to step to or Monaco's reference peek is open, so
  // Monaco's own F4 still works there.
  nextSearchHit: { key: 'f4' },
  prevSearchHit: { key: 'f4', shift: true },
}

/**
 * The only shortcuts that mean something when the key is held down (cycling
 * tabs, stepping search hits). Every other one is an action: Run held would trigger the workflow
 * once per auto-repeat, and a held toggle would flicker open and shut.
 */
export const REPEATING_SHORTCUTS: ReadonlySet<IdeShortcutId> = new Set([
  'nextTab',
  'prevTab',
  'nextSearchHit',
  'prevSearchHit',
])

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

/** The first workspace binding the event satisfies, or null. */
export function matchShortcut(event: KeyEventLike, isMac: boolean): IdeShortcutId | null {
  for (const id of Object.keys(IDE_SHORTCUTS) as IdeShortcutId[]) {
    if (matchesShortcut(event, IDE_SHORTCUTS[id], isMac)) return id
  }
  return null
}

const CODE_LABELS: Record<string, string> = {
  BracketRight: ']',
  BracketLeft: '[',
}

function keyLabel(keys: ShortcutKeys, isMac: boolean): string {
  if (keys.code === 'Enter') return isMac ? '⏎' : 'Enter'
  if (keys.code) return CODE_LABELS[keys.code] ?? keys.code.replace(/^Key/, '')
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
