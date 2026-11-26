import type { ShortcutKeys } from './keys'

/**
 * Where a shortcut works. `global` is every signed-in page; `workflow` a
 * workflow's or function's pages; `canvas` the canvas editor. The Code view
 * keeps its own bindings (`lib/ide/shortcuts.ts`).
 */
export type ShortcutScope = 'global' | 'workflow' | 'canvas'

export type ShortcutGroup = 'general' | 'go' | 'item' | 'canvas'

export const SHORTCUT_GROUP_LABELS: Readonly<Record<ShortcutGroup, string>> = {
  general: 'General',
  go: 'Go to',
  item: 'This workflow or function',
  canvas: 'Canvas',
}

export interface AppShortcut {
  scope: ShortcutScope
  group: ShortcutGroup
  label: string
  /** A chord, or a single key (no ⌘/Ctrl or ⌥) that never fires while typing. */
  keys?: ShortcutKeys
  /** Other keys that do the same, unlisted (`=` for `+`, which needs Shift). */
  aliases?: readonly string[]
  /** Two keys pressed one after the other, within a second: `g` then `p`. */
  sequence?: readonly [string, string]
  /**
   * Bound by its own component, not through the dispatcher (the canvas's
   * clipboard, undo and save keys, React Flow's delete): listed in the
   * shortcuts sheet only.
   */
  listedOnly?: true
  /** A chord that means something else in a field (⌘A selects its text): skipped while typing. */
  notWhileTyping?: true
}

function go(scope: ShortcutScope, second: string, label: string, group: ShortcutGroup = 'go') {
  return { scope, group, label, sequence: ['g', second] } as const satisfies AppShortcut
}

/**
 * Every app shortcut outside the Code view. The dispatcher, the command
 * palette and the shortcuts sheet all read this one list.
 *
 * Plain keys follow GitHub and Linear (`?`, `/`, `g` then a letter); chords
 * avoid what a browser owns (⇧⌘R reloads, ⇧⌘D bookmarks tabs, ⇧⌘L is
 * Safari's sidebar). The theme matches the physical key, since Option
 * rewrites the glyph on macOS.
 */
export const APP_SHORTCUTS = {
  palette: {
    scope: 'global',
    group: 'general',
    label: 'Command palette',
    keys: { key: 'k', mod: true },
  },
  help: { scope: 'global', group: 'general', label: 'Keyboard shortcuts', keys: { key: '?' } },
  search: { scope: 'global', group: 'general', label: 'Search this page', keys: { key: '/' } },
  theme: {
    scope: 'global',
    group: 'general',
    label: 'Switch light or dark theme',
    keys: { code: 'KeyL', shift: true, alt: true },
    // On a Mac ⌥⇧L types "Ò": a field keeps it.
    notWhileTyping: true,
  },
  goProjects: go('global', 'p', 'Projects'),
  goResources: go('global', 'r', 'Resources'),
  goInbox: go('global', 'i', 'Inbox'),
  goAudit: go('global', 'a', 'Audit log'),
  goApiKeys: go('global', 'k', 'API keys'),
  goSettings: go('global', 's', 'Settings'),
  goWhatsNew: go('global', 'n', 'What’s new'),
  goWorkflows: go('global', 'w', 'Workflows in this workspace'),
  goFunctions: go('global', 'f', 'Functions in this workspace'),
  goRuns: go('global', 'u', 'Runs in this workspace'),

  goItemOverview: go('workflow', 'o', 'Overview', 'item'),
  goItemRuns: go('workflow', 'u', 'Runs', 'item'),
  goItemDeployments: go('workflow', 'd', 'Deployments', 'item'),
  openEditor: { scope: 'workflow', group: 'item', label: 'Open the editor', keys: { key: 'e' } },
  deploy: { scope: 'workflow', group: 'item', label: 'Deploy', keys: { key: 'd' } },
  run: { scope: 'workflow', group: 'item', label: 'Run or call it', keys: { key: 'r' } },

  canvasSave: { scope: 'canvas', group: 'canvas', label: 'Save', keys: { key: 's', mod: true } },
  canvasSaveEnter: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Save',
    keys: { key: 'enter', mod: true },
    listedOnly: true,
  },
  canvasUndo: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Undo',
    keys: { key: 'z', mod: true },
    listedOnly: true,
  },
  canvasRedo: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Redo',
    keys: { key: 'z', mod: true, shift: true },
    listedOnly: true,
  },
  canvasCopy: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Copy steps',
    keys: { key: 'c', mod: true },
    listedOnly: true,
  },
  canvasPaste: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Paste steps',
    keys: { key: 'v', mod: true },
    listedOnly: true,
  },
  canvasDuplicate: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Duplicate steps',
    keys: { key: 'd', mod: true },
    listedOnly: true,
  },
  canvasDelete: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Delete the selected steps',
    keys: { key: 'backspace' },
    listedOnly: true,
  },
  canvasSelectAll: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Select every step',
    keys: { key: 'a', mod: true },
    notWhileTyping: true,
  },
  canvasDeselect: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Clear the selection',
    keys: { key: 'escape' },
  },
  canvasFit: { scope: 'canvas', group: 'canvas', label: 'Fit to screen', keys: { key: 'f' } },
  canvasZoomIn: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Zoom in',
    keys: { key: '+' },
    aliases: ['='],
  },
  canvasZoomOut: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Zoom out',
    keys: { key: '-' },
    aliases: ['_'],
  },
  canvasZoomReset: {
    scope: 'canvas',
    group: 'canvas',
    label: 'Zoom to 100%',
    keys: { key: '0' },
  },
} as const satisfies Record<string, AppShortcut>

export type AppShortcutId = keyof typeof APP_SHORTCUTS

/** Held down, these repeat; every other one is an action that runs once per press. */
export const REPEATING_APP_SHORTCUTS: ReadonlySet<AppShortcutId> = new Set([
  'canvasZoomIn',
  'canvasZoomOut',
])

/** Inner scopes win over outer ones on the same keys: a workflow's `g u` is its own Runs. */
export const SCOPE_RANK: Readonly<Record<ShortcutScope, number>> = {
  global: 0,
  workflow: 1,
  canvas: 1,
}
