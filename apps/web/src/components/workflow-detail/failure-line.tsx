import { failureLine } from '../../lib/action-toast'

/** Why a dialog's action failed: the server's 4xx reason, else the general line. */
export function FailureLine({ error, general }: { error: Error | null; general: string }) {
  if (!error) return null
  return (
    <p role="alert" className="text-xs text-status-error">
      {failureLine(error, general)}
    </p>
  )
}
