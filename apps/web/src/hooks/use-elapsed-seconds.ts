import { useEffect, useState } from 'react'
import { elapsedSeconds } from '../lib/ide/session-log'

/**
 * Whole seconds since `sinceMs`, ticking once a second while it is set.
 * A timer is the genuine side effect here; nothing else moves the number.
 */
export function useElapsedSeconds(sinceMs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (sinceMs === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [sinceMs])

  return sinceMs === null ? null : elapsedSeconds(now, sinceMs)
}
