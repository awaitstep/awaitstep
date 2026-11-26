import { IDE_SHORTCUT_LABELS, IDE_SHORTCUTS, type IdeShortcutId } from '../../lib/ide/shortcuts'
import type { ListedIdeShortcuts } from '../../hooks/use-ide-shortcuts'
import { formatShortcut } from '../../lib/shortcuts/keys'
import { shortcutPresses, type KeyPresses } from '../../lib/shortcuts/hints'
import {
  APP_SHORTCUTS,
  SHORTCUT_GROUP_LABELS,
  type AppShortcut,
  type AppShortcutId,
  type ShortcutGroup,
  type ShortcutScope,
} from '../../lib/shortcuts/registry'

export type { KeyPresses }

export interface SheetRow {
  label: string
  /** Each alternative that does the same: ⌘S and ⌘⏎ both save. */
  keys: KeyPresses[]
}

export interface SheetSection {
  heading: string
  rows: SheetRow[]
}

const GROUP_ORDER: ShortcutGroup[] = ['general', 'go', 'item', 'canvas']

/** Rows by label, so two keys that do the same are one row. */
function rowsByLabel(entries: { label: string; presses: KeyPresses }[]): SheetRow[] {
  const rows = new Map<string, SheetRow>()
  for (const { label, presses } of entries) {
    const row = rows.get(label) ?? { label, keys: [] }
    row.keys.push(presses)
    rows.set(label, row)
  }
  return [...rows.values()]
}

/**
 * What the `?` sheet lists: exactly what works here. A shortcut shows when
 * the page binds it now, or, for keys a component binds on its own (the
 * canvas's ⌘Z), when its scope is mounted. Each surface on the IDE's keymap
 * adds only the keys it binds, in its own words, under its own heading: the
 * canvas's ⌘B joins the Canvas section as "Show or hide the nodes".
 */
export function sheetSections(input: {
  bound: readonly AppShortcutId[]
  scopes: ReadonlySet<ShortcutScope>
  ide: readonly ListedIdeShortcuts[]
  isMac: boolean
}): SheetSection[] {
  const bound = new Set(input.bound)
  const entries = Object.entries(APP_SHORTCUTS) as [AppShortcutId, AppShortcut][]
  const byHeading = new Map<string, { label: string; presses: KeyPresses }[]>()
  function add(heading: string, label: string, presses: KeyPresses) {
    const rows = byHeading.get(heading) ?? []
    rows.push({ label, presses })
    byHeading.set(heading, rows)
  }
  for (const group of GROUP_ORDER)
    for (const [id, s] of entries)
      if (s.group === group && (s.listedOnly ? input.scopes.has(s.scope) : bound.has(id)))
        add(SHORTCUT_GROUP_LABELS[group], s.label, shortcutPresses(s, input.isMac))
  const order = Object.keys(IDE_SHORTCUTS) as IdeShortcutId[]
  for (const surface of input.ide)
    for (const id of order)
      if (surface.ids.includes(id))
        add(surface.heading, surface.labels?.[id] ?? IDE_SHORTCUT_LABELS[id], [
          formatShortcut(IDE_SHORTCUTS[id], input.isMac),
        ])
  return [...byHeading].map(([heading, rows]) => ({ heading, rows: dedupe(rowsByLabel(rows)) }))
}

/** Two surfaces binding the same key (the Code view's header and body both bind ⌥⌘V) list it once. */
function dedupe(rows: SheetRow[]): SheetRow[] {
  return rows.map((row) => ({
    ...row,
    keys: row.keys.filter(
      (presses, at) => row.keys.findIndex((p) => p.join() === presses.join()) === at,
    ),
  }))
}
