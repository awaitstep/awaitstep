import { useEffect, useState } from 'react'

/**
 * True only after hydration. Use to gate client-only UI that depends on
 * persisted state (which the server cannot know) without a hydration mismatch.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}
