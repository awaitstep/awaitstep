import { matchesShortcut, type KeyEventLike, type ShortcutKeys } from '../shortcuts/keys'

// The key model is shared with the rest of the app's shortcuts; the IDE's own
// bindings stay here. Re-exported so the IDE's importers keep one entry point.
export {
  formatShortcut,
  matchesShortcut,
  type KeyEventLike,
  type ShortcutKeys,
} from '../shortcuts/keys'

export type IdeShortcutId =
  | 'save'
  | 'saveAll'
  | 'newFile'
  | 'quickOpen'
  | 'commandPalette'
  | 'commandPaletteAlt'
  | 'toggleExplorer'
  | 'toggleDock'
  | 'togglePreview'
  | 'envVars'
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
  // ⌘K is the palette everywhere in the app; it takes Monaco's ⌘K chord
  // prefix here (⌘/ still comments a line). VS Code's ⇧⌘P opens it too.
  commandPalette: { key: 'k', mod: true },
  commandPaletteAlt: { key: 'p', mod: true, shift: true },
  toggleExplorer: { key: 'b', mod: true },
  toggleDock: { key: 'j', mod: true },
  togglePreview: { code: 'KeyB', mod: true, alt: true },
  // V for variables. Not E: AltGr+E types € on many European layouts, and AltGr reads as Ctrl+Alt on Windows.
  // Option rewrites the glyph on macOS, so match the physical key. ⌘V (paste) has no Alt.
  envVars: { code: 'KeyV', mod: true, alt: true },
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

/** The first workspace binding the event satisfies, or null. */
export function matchShortcut(event: KeyEventLike, isMac: boolean): IdeShortcutId | null {
  for (const id of Object.keys(IDE_SHORTCUTS) as IdeShortcutId[]) {
    if (matchesShortcut(event, IDE_SHORTCUTS[id], isMac)) return id
  }
  return null
}

/** What each binding does, for the keyboard shortcuts sheet. */
export const IDE_SHORTCUT_LABELS: Readonly<Record<IdeShortcutId, string>> = {
  save: 'Save file',
  saveAll: 'Save all files',
  newFile: 'New file',
  quickOpen: 'Go to file',
  commandPalette: 'Command palette',
  commandPaletteAlt: 'Command palette',
  toggleExplorer: 'Show or hide the side bar',
  toggleDock: 'Show or hide the panel',
  togglePreview: 'Show or hide the canvas preview',
  envVars: 'Variables',
  nextTab: 'Next tab',
  prevTab: 'Previous tab',
  closeTab: 'Close tab',
  run: 'Run',
  findInFiles: 'Search in files',
  nextSearchHit: 'Next search result',
  prevSearchHit: 'Previous search result',
}
