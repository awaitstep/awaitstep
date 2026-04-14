// A no-op Storage shim for SSR. zustand's persist middleware calls
// getItem/setItem/removeItem during hydration/saves; during SSR there is no
// window.localStorage, so we return this stub to prevent "Cannot read
// properties of undefined" crashes. All writes are discarded; reads return
// null. On the client, the persist middleware replaces this with real
// localStorage before any state is persisted.
const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
}

export function browserStorage(): Storage {
  return typeof window === 'undefined' ? noopStorage : window.localStorage
}
