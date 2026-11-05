// A Storage for zustand's persist middleware that can never throw into a
// `set`. persist writes synchronously inside every state change, so a full
// quota (QuotaExceededError), a blocked-storage browser or a private window
// would otherwise break each keystroke in every persisted store. A write that
// fails is dropped: the in-memory state is still right, only the reload
// convenience is lost.
//
// During SSR there is no window.localStorage, so everything is a no-op there.
function local(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function createGuardedStorage(dropOnFailedWrite: boolean): Storage {
  return {
    get length() {
      return local()?.length ?? 0
    },
    clear: () => {
      try {
        local()?.clear()
      } catch {
        // Nothing to clear if storage is unreachable.
      }
    },
    getItem: (key) => {
      try {
        return local()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    key: (index) => {
      try {
        return local()?.key(index) ?? null
      } catch {
        return null
      }
    },
    removeItem: (key) => {
      try {
        local()?.removeItem(key)
      } catch {
        // As above.
      }
    },
    setItem: (key, value) => {
      try {
        local()?.setItem(key, value)
      } catch {
        // Quota or blocked storage: dropped, see the note at the top.
        if (dropOnFailedWrite) {
          // A value that cannot be replaced must not survive either: the old
          // one would still hold what the new state just removed.
          try {
            local()?.removeItem(key)
          } catch {
            // Nothing more can be done.
          }
        }
      }
    },
  }
}

const guardedStorage = createGuardedStorage(false)
const strictStorage = createGuardedStorage(true)

export function browserStorage(): Storage {
  return guardedStorage
}

/**
 * As `browserStorage`, but a write that fails also removes the key, so the
 * older value cannot outlive the change that was meant to replace it. For
 * state that can hold secrets; layout state keeps the plain one.
 */
export function strictBrowserStorage(): Storage {
  return strictStorage
}
