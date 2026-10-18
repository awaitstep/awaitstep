import { useEffect, useRef } from 'react'
import { matchShortcut, type IdeShortcutId } from '../lib/ide/shortcuts'
import { isMacPlatform } from '../lib/platform'

export type IdeShortcutHandlers = Partial<Record<IdeShortcutId, () => void>>

/**
 * Binds the workspace shortcuts on the window in the capture phase so they
 * win over Monaco's own keymap and the browser defaults (⌘S, ⌘P). Keys
 * pressed inside an open dialog belong to that dialog. Handlers are read
 * through a ref, so callers can pass fresh closures every render.
 */
export function useIdeShortcuts(handlers: IdeShortcutHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const isMac = isMacPlatform()
    function handleKeyDown(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return
      const id = matchShortcut(event, isMac)
      if (!id) return
      const handler = handlersRef.current[id]
      if (!handler) return
      event.preventDefault()
      event.stopPropagation()
      handler()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])
}
