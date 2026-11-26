import { useEffect, useRef } from 'react'
import { matchShortcut, REPEATING_SHORTCUTS, type IdeShortcutId } from '../lib/ide/shortcuts'
import { isMacPlatform } from '../lib/platform'

/** A handler that returns `false` declines the key: it goes on to whoever else wants it. */
export type IdeShortcutHandlers = Partial<
  Record<IdeShortcutId, (event: KeyboardEvent) => void | false>
>

/** The only shortcuts whose handlers may decline; every other one owns its key outright. */
const DECLINABLE: ReadonlySet<IdeShortcutId> = new Set(['run', 'nextSearchHit', 'prevSearchHit'])

/**
 * How a surface's keys read in the shortcuts sheet: its heading, and wording
 * of its own where the Code view's would be wrong (⌘B shows the canvas's
 * nodes, not a side bar).
 */
export interface IdeShortcutListing {
  heading: string
  labels?: Partial<Record<IdeShortcutId, string>>
}

/** A mounted surface's keys as the sheet lists them: only the ones it binds right now. */
export interface ListedIdeShortcuts extends IdeShortcutListing {
  ids: IdeShortcutId[]
}

const CODE_VIEW: IdeShortcutListing = { heading: 'Code view' }

interface MountedSurface {
  handlers: { current: IdeShortcutHandlers }
  listing: IdeShortcutListing
}

/** Every mounted surface's handlers, so the app's own shortcuts can give way to them. */
const mounted = new Set<MountedSurface>()
const mountedListeners = new Set<() => void>()

function notifyMounted() {
  for (const listener of mountedListeners) listener()
}

/**
 * True when a mounted Code view or canvas toolbar binds this key. The app's
 * dispatcher listens on the window too, and which listener runs first
 * depends on mount order, so it asks instead of relying on that.
 */
export function ideBindsKey(event: KeyboardEvent): boolean {
  const id = matchShortcut(event, isMacPlatform())
  if (!id) return false
  for (const surface of mounted) if (surface.handlers.current[id]) return true
  return false
}

/** What each mounted surface binds now, for the shortcuts sheet. */
export function listedIdeShortcuts(): ListedIdeShortcuts[] {
  return [...mounted].map(({ handlers, listing }) => ({
    ...listing,
    ids: (Object.keys(handlers.current) as IdeShortcutId[]).filter((id) => handlers.current[id]),
  }))
}

/** Whether any surface binds IDE shortcuts right now, for the shortcuts sheet. */
export function isIdeMounted(): boolean {
  return mounted.size > 0
}

export function subscribeIdeMounted(listener: () => void): () => void {
  mountedListeners.add(listener)
  return () => mountedListeners.delete(listener)
}

/**
 * Binds the workspace shortcuts on the window in the capture phase so they
 * win over Monaco's own keymap and the browser defaults (⌘S, ⌘P). Keys
 * pressed inside an open dialog belong to that dialog. Handlers are read
 * through a ref, so callers can pass fresh closures every render. A handler
 * may decline by returning `false` (F4 with nothing to step to leaves the
 * key to Monaco's reference peek; Run leaves ⌥⏎ to Monaco's find widget and
 * to fields of their own).
 */
export function useIdeShortcuts(
  handlers: IdeShortcutHandlers,
  listing: IdeShortcutListing = CODE_VIEW,
): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const listingRef = useRef(listing)
  listingRef.current = listing

  useEffect(() => {
    const isMac = isMacPlatform()
    // Read through the refs, so the sheet sees this render's handlers and wording.
    const surface: MountedSurface = {
      handlers: handlersRef,
      get listing() {
        return listingRef.current
      },
    }
    mounted.add(surface)
    notifyMounted()
    function handleKeyDown(event: KeyboardEvent) {
      // Dialogs and the explorer's name row own their keys while open.
      const id = matchShortcut(event, isMac)
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"], [role="alertdialog"], [data-ide-text-input]')
      ) {
        // Not ours to run, but the browser's own meaning (Save Page, Print)
        // would be just as wrong while typing in a field or answering a dialog.
        // Only for a chord this surface binds: ⇧⌘] on a canvas that has no
        // tabs is the browser's tab switch, and a dialog is no reason to take it.
        if (id && handlersRef.current[id]) event.preventDefault()
        return
      }
      if (!id) return
      const handler = handlersRef.current[id]
      if (!handler) return
      // Held down: the browser's meaning is still ours to swallow, but an
      // action must not run again for every auto-repeat.
      const ignoreRepeat = event.repeat && !REPEATING_SHORTCUTS.has(id)
      if (!DECLINABLE.has(id)) {
        // Taken before the handler runs: a handler that throws must not
        // leave the browser to open Save Page or Print.
        event.preventDefault()
        event.stopPropagation()
        if (!ignoreRepeat) handler(event)
        return
      }
      let declined = false
      try {
        declined = !ignoreRepeat && handler(event) === false
      } finally {
        if (!declined) {
          event.preventDefault()
          event.stopPropagation()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      mounted.delete(surface)
      notifyMounted()
    }
  }, [])
}
