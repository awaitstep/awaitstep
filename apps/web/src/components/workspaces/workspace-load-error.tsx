import { useState } from 'react'
import { errorIdOf } from '../../data/dashboard/errors'
import { Banner } from '../ui/banner'
import { LoadError } from '../ui/load-error'

interface WorkspaceLoadErrorProps {
  /** "workflows": the title reads "We couldn’t load workflows". */
  what: string
  error: unknown
  onRetry: () => void
  retrying: boolean
}

/**
 * The `LoadError` board: the error card (counting tries) and the note that
 * deployed workflows keep running. No status page link: there is none (D-P2-10).
 */
export function WorkspaceLoadError({ what, error, onRetry, retrying }: WorkspaceLoadErrorProps) {
  const [attempts, setAttempts] = useState(0)

  function handleRetry() {
    setAttempts((n) => n + 1)
    onRetry()
  }

  const detail =
    attempts === 0
      ? 'The server took too long to answer. Nothing was changed. Try again in a moment.'
      : `Still not answering after ${attempts + 1} tries. Try again in a minute.`

  return (
    <>
      <LoadError
        title={`We couldn’t load ${what}`}
        detail={detail}
        onRetry={handleRetry}
        retrying={retrying}
        attempts={attempts}
        errorId={errorIdOf(error)}
      />
      <Banner tone="warn">
        Your deployed workflows keep running. Only this page couldn’t load.
      </Banner>
    </>
  )
}
