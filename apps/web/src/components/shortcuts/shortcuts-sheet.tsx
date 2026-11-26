import { useSyncExternalStore } from 'react'
import { useActiveShortcutScopes, boundAppShortcuts } from '../../hooks/use-app-shortcuts'
import {
  isIdeMounted,
  listedIdeShortcuts,
  subscribeIdeMounted,
} from '../../hooks/use-ide-shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useShortcutsStore } from '../../stores/shortcuts-store'
import { Button } from '../ui/button'
import { Kbd } from '../ui/kbd'
import { ModalDialog } from '../ui/modal-dialog'
import { sheetSections, type KeyPresses, type SheetRow } from './sheet-model'

function serverIdeMounted() {
  return false
}

/** The `?` sheet: every shortcut that works on this page, grouped. */
export function ShortcutsSheet() {
  const open = useShortcutsStore((s) => s.dialog === 'help')
  const close = useShortcutsStore((s) => s.close)
  const scopes = useActiveShortcutScopes()
  // Re-renders as a surface mounts or unmounts; what each binds is read below.
  useSyncExternalStore(subscribeIdeMounted, isIdeMounted, serverIdeMounted)
  // Read on open: which handlers the page binds changes with its state.
  const sections = open
    ? sheetSections({
        bound: boundAppShortcuts(),
        scopes,
        ide: listedIdeShortcuts(),
        isMac: isMacPlatform(),
      })
    : []

  function handleOpenChange(next: boolean) {
    if (!next) close()
  }

  return (
    <ModalDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Keyboard shortcuts"
      description="What works on this page. Single keys don’t fire while you type in a field."
      size="md"
      actions={<Button onClick={close}>Done</Button>}
    >
      <div className="flex flex-col gap-5">
        {sections.map((section) => (
          <section key={section.heading} aria-label={section.heading}>
            <h3 className="mb-1.5 text-2xs font-semibold text-muted-foreground">
              {section.heading}
            </h3>
            <dl className="flex flex-col">
              {section.rows.map((row) => (
                <ShortcutRow key={row.label} row={row} />
              ))}
            </dl>
          </section>
        ))}
      </div>
    </ModalDialog>
  )
}

function ShortcutRow({ row }: { row: SheetRow }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-1.5 text-xs last:border-b-0">
      <dt className="text-foreground/85">{row.label}</dt>
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
    <span className="flex items-center gap-1 text-2xs text-muted-foreground">
      {presses.map((press, at) => (
        <span key={`${at}-${press}`} className="flex items-center gap-1">
          {at > 0 && <span>then</span>}
          <Kbd>{press}</Kbd>
        </span>
      ))}
    </span>
  )
}
