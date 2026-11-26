import { matchesShortcut, type KeyEventLike, type ShortcutKeys } from './keys'
import {
  APP_SHORTCUTS,
  REPEATING_APP_SHORTCUTS,
  SCOPE_RANK,
  type AppShortcut,
  type AppShortcutId,
  type ShortcutScope,
} from './registry'

/** A handler that returns `false` declines the key: the next one that binds it gets it. */
export type AppShortcutHandler = () => void | false
export type AppShortcutHandlers = Partial<Record<AppShortcutId, AppShortcutHandler | undefined>>

export interface DispatchEvent extends KeyEventLike {
  repeat: boolean
}

/** Where the key was pressed, which decides which shortcuts may have it. */
export interface DispatchContext {
  /** In a field, a text area or a code editor: plain keys are typing there. */
  typing: boolean
  /** In an open dialog, which keeps its keys. */
  inDialog: boolean
}

interface Layer {
  scope: ShortcutScope
  handlers: () => AppShortcutHandlers
  order: number
}

/** How long a `g` waits for its second key. */
export const SEQUENCE_WINDOW_MS = 1000

const ENTRIES = Object.entries(APP_SHORTCUTS) as [AppShortcutId, AppShortcut][]

function isChord(keys: ShortcutKeys): boolean {
  return Boolean(keys.mod || keys.alt || keys.code)
}

/** No ⌘, Ctrl or ⌥: a key typed on its own (Shift allowed, it makes `?` and `+`). */
function isPlainPress(event: KeyEventLike): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey
}

/**
 * A single key on its own. Letters need no Shift (Shift+E is a capital, not
 * `e`); symbols ignore it, since layouts put `?` and `+` on different keys.
 */
function matchesPlainKey(event: KeyEventLike, shortcut: AppShortcut): boolean {
  if (!shortcut.keys?.key || !isPlainPress(event)) return false
  const pressed = event.key
  const letter = /^[a-z]$/i.test(pressed)
  if (letter && event.shiftKey) return false
  // Named keys (`escape`) are stored in lower case, as `Escape` lowers to.
  return [shortcut.keys.key, ...(shortcut.aliases ?? [])].includes(pressed.toLowerCase())
}

/**
 * The app's shortcut dispatcher, apart from the DOM: layers of handlers by
 * scope, chords, single keys and `g` sequences. Inner scopes come first, and
 * among equal scopes the latest to mount. `handle` says whether the key was
 * used, so the caller can take it from the browser.
 */
export function createShortcutDispatcher(options: { isMac: boolean; now?: () => number }) {
  const now = options.now ?? Date.now
  const layers: Layer[] = []
  const listeners = new Set<() => void>()
  let pending: { key: string; at: number } | null = null
  let order = 0
  let scopesSnapshot: ReadonlySet<ShortcutScope> = new Set()

  function refreshScopes() {
    scopesSnapshot = new Set(layers.map((layer) => layer.scope))
    for (const listener of listeners) listener()
  }

  function ordered(): Layer[] {
    return [...layers].sort(
      (a, b) => SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope] || b.order - a.order,
    )
  }

  /** Every bound handler for the matching shortcuts, innermost first, with its id. */
  function candidates(
    match: (shortcut: AppShortcut) => boolean,
  ): { id: AppShortcutId; run: AppShortcutHandler }[] {
    const found: { id: AppShortcutId; run: AppShortcutHandler }[] = []
    for (const layer of ordered()) {
      const handlers = layer.handlers()
      for (const [id, shortcut] of ENTRIES) {
        if (shortcut.scope !== layer.scope || shortcut.listedOnly || !match(shortcut)) continue
        const run = handlers[id]
        if (run) found.push({ id, run })
      }
    }
    return found
  }

  /**
   * The first handler that doesn't decline; true when one took the key. Held
   * down, an action is still taken from the browser but runs only once.
   */
  function runFirst(
    found: { id: AppShortcutId; run: AppShortcutHandler }[],
    repeat: boolean,
  ): boolean {
    if (found.length === 0) return false
    if (repeat && !found.some(({ id }) => REPEATING_APP_SHORTCUTS.has(id))) return true
    return found.some(({ run }) => run() !== false)
  }

  function handle(event: DispatchEvent, context: DispatchContext): boolean {
    if (context.inDialog) {
      pending = null
      return false
    }
    const plain = isPlainPress(event) && !context.typing

    // The second key of a `g` sequence.
    if (pending && plain && now() - pending.at <= SEQUENCE_WINDOW_MS) {
      const first = pending.key
      pending = null
      const second = event.key.toLowerCase()
      const found = candidates((s) => s.sequence?.[0] === first && s.sequence[1] === second)
      if (found.length > 0) return runFirst(found, event.repeat)
    }
    pending = null

    // Chords work while typing: ⌘K and ⌘S mean nothing to a text field.
    const chord = candidates(
      (s) =>
        !!s.keys &&
        isChord(s.keys) &&
        !(s.notWhileTyping && context.typing) &&
        matchesShortcut(event, s.keys, options.isMac),
    )
    if (chord.length > 0) return runFirst(chord, event.repeat)

    if (!plain) return false

    const single = candidates((s) => !!s.keys && !isChord(s.keys) && matchesPlainKey(event, s))
    if (single.length > 0) return runFirst(single, event.repeat)

    // The first key of a sequence some mounted layer binds.
    const first = event.key.toLowerCase()
    if (
      !event.repeat &&
      !event.shiftKey &&
      candidates((s) => s.sequence?.[0] === first).length > 0
    ) {
      pending = { key: first, at: now() }
    }
    return false
  }

  return {
    handle,
    /** Shortcuts some mounted layer can run now, innermost first: the palette lists them. */
    bound(): AppShortcutId[] {
      return [...new Set(candidates(() => true).map(({ id }) => id))]
    },
    /** Runs a shortcut as if pressed (from the palette); false when nothing took it. */
    run(id: AppShortcutId): boolean {
      return runFirst(
        candidates((s) => s === APP_SHORTCUTS[id]),
        false,
      )
    },
    /** Mounts a layer of handlers; the returned function unmounts it. */
    register(scope: ShortcutScope, handlers: () => AppShortcutHandlers): () => void {
      const layer: Layer = { scope, handlers, order: order++ }
      layers.push(layer)
      refreshScopes()
      return () => {
        const at = layers.indexOf(layer)
        if (at >= 0) layers.splice(at, 1)
        refreshScopes()
      }
    },
    /** The scopes with a layer mounted, for the shortcuts sheet. */
    scopes(): ReadonlySet<ShortcutScope> {
      return scopesSnapshot
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ShortcutDispatcher = ReturnType<typeof createShortcutDispatcher>
