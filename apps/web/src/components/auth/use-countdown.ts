import { useEffect, useState } from 'react'

interface Countdown {
  /** Whole seconds left; 0 when nothing is counting. */
  remaining: number
  /** Starts counting `seconds` from now. */
  start: (seconds: number) => void
}

/** A lock that lifts itself: the sign-in page's "Try again in 1:58". */
export function useCountdown(): Countdown {
  const [clock, setClock] = useState<{ until: number; now: number } | null>(null)
  const until = clock?.until ?? null

  // A timer is the one thing here that has to run after paint.
  useEffect(() => {
    if (until === null) return
    const id = setInterval(() => {
      const now = Date.now()
      setClock({ until, now })
      if (now >= until) clearInterval(id)
    }, 500)
    return () => clearInterval(id)
  }, [until])

  function start(seconds: number) {
    const now = Date.now()
    setClock({ until: now + seconds * 1000, now })
  }

  return { remaining: clock ? Math.max(0, Math.ceil((clock.until - clock.now) / 1000)) : 0, start }
}
