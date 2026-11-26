import { IDE_SHORTCUT_LABELS, IDE_SHORTCUTS, type IdeShortcutId } from '../../lib/ide/shortcuts'
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
 * canvas's ⌘Z), when its scope is mounted; the Code view's when it is open.
 */
export function sheetSections(input: {
  bound: readonly AppShortcutId[]
  scopes: ReadonlySet<ShortcutScope>
  ideMounted: boolean
  isMac: boolean
}): SheetSection[] {
  const bound = new Set(input.bound)
  const entries = Object.entries(APP_SHORTCUTS) as [AppShortcutId, AppShortcut][]
  const sections: SheetSection[] = GROUP_ORDER.map((group) => ({
    heading: SHORTCUT_GROUP_LABELS[group],
    rows: rowsByLabel(
      entries
        .filter(
          ([id, s]) =>
            s.group === group && (s.listedOnly ? input.scopes.has(s.scope) : bound.has(id)),
        )
        .map(([, s]) => ({ label: s.label, presses: shortcutPresses(s, input.isMac) })),
    ),
  }))
  if (input.ideMounted) {
    const ide = Object.keys(IDE_SHORTCUTS) as IdeShortcutId[]
    sections.push({
      heading: 'Code view',
      rows: rowsByLabel(
        ide.map((id) => ({
          label: IDE_SHORTCUT_LABELS[id],
          presses: [formatShortcut(IDE_SHORTCUTS[id], input.isMac)],
        })),
      ),
    })
  }
  return sections.filter((section) => section.rows.length > 0)
}
