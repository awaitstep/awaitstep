import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  createShortcutDispatcher,
  type AppShortcutHandlers,
  type ShortcutDispatcher,
} from '../lib/shortcuts/dispatcher'
import type { AppShortcutId, ShortcutScope } from '../lib/shortcuts/registry'
import { isMacPlatform } from '../lib/platform'
import { keyContext } from '../lib/shortcuts/key-context'
import { ideBindsKey } from './use-ide-shortcuts'

let dispatcher: ShortcutDispatcher | null = null
let listeners = 0

function appDispatcher(): ShortcutDispatcher {
  dispatcher ??= createShortcutDispatcher({ isMac: isMacPlatform() })
  return dispatcher
}

function handleKeyDown(event: KeyboardEvent) {
  // The Code view and the canvas toolbar own their bindings (⌘K opens the
  // Code view's own palette), whichever listener the browser runs first.
  if (event.defaultPrevented || ideBindsKey(event)) return
  const used = appDispatcher().handle(event, keyContext(event.target, document))
  if (!used) return
  event.preventDefault()
  // A chord is ours outright (⌘K must not also reach Monaco). A single key
  // still travels on, so a handler further down never misses it.
  if (event.metaKey || event.ctrlKey || event.altKey) event.stopPropagation()
}

/**
 * Binds app shortcuts for one scope while the calling component is mounted
 * (see `lib/shortcuts/registry.ts`). Handlers are read through a ref, so
 * fresh closures every render are fine; leave one undefined to not bind it
 * here, or return `false` from it to pass the key on.
 */
export function useAppShortcuts(scope: ShortcutScope, handlers: AppShortcutHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const unregister = appDispatcher().register(scope, () => handlersRef.current)
    if (listeners++ === 0) window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      unregister()
      if (--listeners === 0) window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [scope])
}

const NO_SCOPES: ReadonlySet<ShortcutScope> = new Set()

function subscribeScopes(listener: () => void) {
  return appDispatcher().subscribe(listener)
}

function scopesSnapshot() {
  return appDispatcher().scopes()
}

function serverScopes() {
  return NO_SCOPES
}

/** The scopes with shortcuts bound right now, for the shortcuts sheet. */
export function useActiveShortcutScopes(): ReadonlySet<ShortcutScope> {
  return useSyncExternalStore(subscribeScopes, scopesSnapshot, serverScopes)
}

/** What the current page can run, innermost first, read when the palette opens. */
export function boundAppShortcuts(): AppShortcutId[] {
  return appDispatcher().bound()
}

/** Runs an app shortcut as if pressed, for the palette. */
export function runAppShortcut(id: AppShortcutId): boolean {
  return appDispatcher().run(id)
}
