import { describe, expect, it } from 'vitest'
import {
  IDE_SHORTCUTS,
  formatShortcut,
  matchShortcut,
  matchesShortcut,
  type KeyEventLike,
} from '../ide/shortcuts'
import { isMacPlatform } from '../platform'

function key(overrides: Partial<KeyEventLike>): KeyEventLike {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  }
}

describe('matchShortcut', () => {
  it('binds ⌘ on macOS and Ctrl elsewhere', () => {
    expect(matchShortcut(key({ key: 'p', code: 'KeyP', metaKey: true }), true)).toBe('quickOpen')
    expect(matchShortcut(key({ key: 'p', code: 'KeyP', ctrlKey: true }), false)).toBe('quickOpen')
    expect(matchShortcut(key({ key: 'p', code: 'KeyP', ctrlKey: true }), true)).toBeNull()
    expect(matchShortcut(key({ key: 'p', code: 'KeyP', metaKey: true }), false)).toBeNull()
  })

  it('distinguishes the command palette from quick open by Shift', () => {
    expect(
      matchShortcut(key({ key: 'P', code: 'KeyP', metaKey: true, shiftKey: true }), true),
    ).toBe('commandPalette')
  })

  it('matches the canvas preview on the physical key, since Option rewrites the glyph', () => {
    expect(matchShortcut(key({ key: '∫', code: 'KeyB', metaKey: true, altKey: true }), true)).toBe(
      'togglePreview',
    )
    expect(matchShortcut(key({ key: 'b', code: 'KeyB', ctrlKey: true, altKey: true }), false)).toBe(
      'togglePreview',
    )
  })

  it('leaves both kinds of paste alone', () => {
    // Ctrl+Shift+V is paste-as-plain-text on Windows and Linux. The listener
    // captures and preventDefaults, so binding it would have stopped paste
    // working anywhere in the workspace, Monaco included.
    expect(
      matchShortcut(key({ key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true }), false),
    ).toBeNull()
    expect(
      matchShortcut(key({ key: 'V', code: 'KeyV', metaKey: true, shiftKey: true }), true),
    ).toBeNull()
    expect(matchShortcut(key({ key: 'v', code: 'KeyV', metaKey: true }), true)).toBeNull()
  })

  it('keeps the explorer toggle distinct from the preview toggle', () => {
    // Same physical key, told apart by Alt — so a missing Alt must not fall
    // through to the preview, nor a present one to the explorer.
    expect(matchShortcut(key({ key: 'b', code: 'KeyB', metaKey: true }), true)).toBe(
      'toggleExplorer',
    )
    expect(matchShortcut(key({ key: 'b', code: 'KeyB', metaKey: true, altKey: true }), true)).toBe(
      'togglePreview',
    )
  })

  it('gives every binding a distinct chord', () => {
    const chords = Object.values(IDE_SHORTCUTS).map((keys) => formatShortcut(keys, true))
    expect(new Set(chords).size).toBe(chords.length)
  })

  it('matches tab cycling on physical codes even though Shift changes the key', () => {
    expect(
      matchShortcut(key({ key: '}', code: 'BracketRight', metaKey: true, shiftKey: true }), true),
    ).toBe('nextTab')
    expect(
      matchShortcut(key({ key: '{', code: 'BracketLeft', ctrlKey: true, shiftKey: true }), false),
    ).toBe('prevTab')
  })

  it('matches close-tab on the physical key because Option rewrites the glyph on macOS', () => {
    expect(matchShortcut(key({ key: '∑', code: 'KeyW', metaKey: true, altKey: true }), true)).toBe(
      'closeTab',
    )
    expect(
      matchesShortcut(
        key({ key: 'w', code: 'KeyW', ctrlKey: true, altKey: true }),
        IDE_SHORTCUTS.closeTab,
        false,
      ),
    ).toBe(true)
  })

  it('ignores plain keys and extra modifiers', () => {
    expect(matchShortcut(key({ key: 's', code: 'KeyS' }), true)).toBeNull()
    expect(
      matchShortcut(key({ key: 's', code: 'KeyS', metaKey: true, altKey: true }), true),
    ).toBeNull()
  })
})

describe('formatShortcut', () => {
  it('renders macOS glyphs in ⌥⇧⌘ order and Ctrl+ chords elsewhere', () => {
    expect(formatShortcut(IDE_SHORTCUTS.commandPalette, true)).toBe('⇧⌘P')
    expect(formatShortcut(IDE_SHORTCUTS.closeTab, true)).toBe('⌥⌘W')
    expect(formatShortcut(IDE_SHORTCUTS.closeTab, false)).toBe('Ctrl+Alt+W')
    expect(formatShortcut(IDE_SHORTCUTS.commandPalette, false)).toBe('Ctrl+Shift+P')
    expect(formatShortcut(IDE_SHORTCUTS.nextTab, true)).toBe('⇧⌘]')
    expect(formatShortcut(IDE_SHORTCUTS.nextTab, false)).toBe('Ctrl+Shift+]')
  })
})

describe('isMacPlatform', () => {
  it('detects Apple platforms from the navigator platform string', () => {
    expect(isMacPlatform('MacIntel')).toBe(true)
    expect(isMacPlatform('iPhone')).toBe(true)
    expect(isMacPlatform('Win32')).toBe(false)
    expect(isMacPlatform('')).toBe(false)
  })
})
