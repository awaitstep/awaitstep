import { useEffect, useRef } from 'react'

/**
 * Polls a function at a fixed interval while enabled.
 * Automatically stops when the component unmounts or enabled becomes false.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
): void {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return

    const tick = () => {
      fnRef.current()
    }

    // Initial call
    tick()

    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])
}
