import { useState, useSyncExternalStore, type ChangeEvent } from 'react'
import { useActiveShortcutScopes, boundAppShortcuts } from '../../hooks/use-app-shortcuts'
import {
  isIdeMounted,
  listedIdeShortcuts,
  subscribeIdeMounted,
} from '../../hooks/use-ide-shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useShortcutsStore } from '../../stores/shortcuts-store'
import { Kbd } from '../ui/kbd'
import {
  SPOTLIGHT_HEADING_CLASS,
  SPOTLIGHT_INPUT_CLASS,
  SPOTLIGHT_ROW_CLASS,
  SpotlightDialog,
  SpotlightEmpty,
  SpotlightResults,
  SpotlightSearchRow,
} from '../ui/spotlight'
import { filterSheetSections, sheetSections, type KeyPresses, type SheetRow } from './sheet-model'

function serverIdeMounted() {
  return false
}

/** The `?` sheet: every shortcut that works on this page, grouped, with a search on top. */
export function ShortcutsSheet() {
  const open = useShortcutsStore((s) => s.dialog === 'help')
  const close = useShortcutsStore((s) => s.close)
  const scopes = useActiveShortcutScopes()
  const [query, setQuery] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  // Re-renders as a surface mounts or unmounts; what each binds is read below.
  useSyncExternalStore(subscribeIdeMounted, isIdeMounted, serverIdeMounted)

  // Each opening starts with an empty search, however the sheet was last closed.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setQuery('')
  }

  // Read on open: which handlers the page binds changes with its state.
  const sections = open
    ? filterSheetSections(
        sheetSections({
          bound: boundAppShortcuts(),
          scopes,
          ide: listedIdeShortcuts(),
          isMac: isMacPlatform(),
        }),
        query,
      )
    : []

  function handleOpenChange(next: boolean) {
    if (!next) close()
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
  }

  // Escape empties the search first, then closes, as Spotlight does.
  function handleEscape() {
    if (!query) return false
    setQuery('')
    return true
  }

  return (
    <SpotlightDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Keyboard shortcuts"
      onEscape={handleEscape}
    >
      <SpotlightSearchRow>
        <input
          autoFocus
          aria-label="Search shortcuts"
          placeholder="Search shortcuts"
          value={query}
          onChange={handleQueryChange}
          className={SPOTLIGHT_INPUT_CLASS}
        />
      </SpotlightSearchRow>
      <SpotlightResults>
        {sections.length === 0 ? (
          <SpotlightEmpty>No shortcut matches “{query.trim()}”</SpotlightEmpty>
        ) : (
          sections.map((section) => (
            <section key={section.heading} aria-label={section.heading}>
              <h3 className={SPOTLIGHT_HEADING_CLASS}>{section.heading}</h3>
              <dl>
                {section.rows.map((row) => (
                  <ShortcutRow key={row.label} row={row} />
                ))}
              </dl>
            </section>
          ))
        )}
      </SpotlightResults>
    </SpotlightDialog>
  )
}

function ShortcutRow({ row }: { row: SheetRow }) {
  return (
    <div className={`${SPOTLIGHT_ROW_CLASS} hover:bg-muted/50`}>
      <dt className="truncate">{row.label}</dt>
      <dd className="flex shrink-0 items-center gap-2">
        {row.keys.map((presses) => (
          <KeyCaps key={presses.join(' ')} presses={presses} />
        ))}
      </dd>
    </div>
  )
}

/** One way to press it: `G` then `P` reads as two caps with "then" between. */
export function KeyCaps({ presses }: { presses: KeyPresses }) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
      {presses.map((press, at) => (
        <span key={`${at}-${press}`} className="flex items-center gap-1.5">
          {at > 0 && <span>then</span>}
          <Kbd className="h-5 min-w-5 justify-center">{press}</Kbd>
        </span>
      ))}
    </span>
  )
}
