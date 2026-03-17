import { create } from 'zustand'

interface PollingState {
  /** Query keys currently needing fast polling */
  active: Set<string>
  /** Start fast-polling a query key */
  start: (key: string) => void
  /** Stop fast-polling a query key */
  stop: (key: string) => void
  /** Check if a query key is being fast-polled */
  has: (key: string) => boolean
}

export const usePollingStore = create<PollingState>((set, get) => ({
  active: new Set(),
  start: (key) =>
    set((state) => {
      const next = new Set(state.active)
      next.add(key)
      return { active: next }
    }),
  stop: (key) =>
    set((state) => {
      const next = new Set(state.active)
      next.delete(key)
      return { active: next }
    }),
  has: (key) => get().active.has(key),
}))

/**
 * Returns a refetchInterval for use with React Query.
 * Fast-polls (2s) when the key is in the polling store, otherwise false (no polling).
 */
export function useRefetchInterval(key: string): number | false {
  const isActive = usePollingStore((s) => s.active.has(key))
  return isActive ? 2_000 : false
}
