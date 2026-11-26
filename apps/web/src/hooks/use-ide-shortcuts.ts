import { useEffect, useRef } from 'react'
import { matchShortcut, REPEATING_SHORTCUTS, type IdeShortcutId } from '../lib/ide/shortcuts'
import { isMacPlatform } from '../lib/platform'

/** A handler that returns `false` declines the key: it goes on to whoever else wants it. */
export type IdeShortcutHandlers = Partial<
  Record<IdeShortcutId, (event: KeyboardEvent) => void | false>
>

/** The only shortcuts whose handlers may decline; every other one owns its key outright. */
const DECLINABLE: ReadonlySet<IdeShortcutId> = new Set(['run', 'nextSearchHit', 'prevSearchHit'])

/** Every mounted surface's handlers, so the app's own shortcuts can give way to them. */
const mounted = new Set<{ current: IdeShortcutHandlers }>()
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
  for (const ref of mounted) if (ref.current[id]) return true
  return false
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
export function useIdeShortcuts(handlers: IdeShortcutHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const isMac = isMacPlatform()
    mounted.add(handlersRef)
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
      mounted.delete(handlersRef)
      notifyMounted()
    }
  }, [])
}
