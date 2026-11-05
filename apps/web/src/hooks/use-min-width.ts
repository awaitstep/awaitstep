import { useCallback, useSyncExternalStore } from 'react'

/**
 * Whether the window is at least `px` wide. A media query is an external
 * source, so it is read with `useSyncExternalStore` rather than copied into
 * state by an effect; it is true on the server, where there is no window.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`

  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
