import { useState } from 'react'
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { ApiError } from '../../lib/api-client'
import { LoadError } from '../ui/load-error'

/** What went wrong, in words for the person: no stack traces or raw messages like "fetch failed". */
export function routeErrorDetail(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status < 500 && error.hasReason) return error.message
    return 'The server ran into a problem. Nothing was changed.'
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error && /fetch failed/i.test(error.message))
  ) {
    return 'We couldn’t reach the server. Check your connection, then try again.'
  }
  return 'Something unexpected went wrong. Nothing was changed.'
}

/**
 * Every route's error view unless it brings its own: the shared load-error
 * card with Try again, which reloads the route's data, and the request's
 * error ID when the server sent one.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const [attempts, setAttempts] = useState(0)

  function handleRetry() {
    setRetrying(true)
    setAttempts((n) => n + 1)
    reset()
    void router.invalidate().finally(() => setRetrying(false))
  }

  return (
    <div className="flex min-h-[60vh] bg-red-500 w-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[520px]">
        <LoadError
          title="We couldn’t load this page"
          detail={routeErrorDetail(error)}
          onRetry={handleRetry}
          retrying={retrying}
          attempts={attempts}
          errorId={error instanceof ApiError ? error.requestId : undefined}
        />
      </div>
    </div>
  )
}
