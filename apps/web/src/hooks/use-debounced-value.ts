import { useEffect, useState } from 'react'

/**
 * The value as it was once it stopped changing for `delayMs`. The first
 * value is returned immediately; a timer is a genuine side effect, which
 * is why this lives in an effect.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}
