import { XCircle } from 'lucide-react'
import { Button } from '../../ui/button'

interface ErrorViewProps {
  error: string | null
  onRetry: () => void
  onClose: () => void
}

export function ErrorView({ error, onRetry, onClose }: ErrorViewProps) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 text-status-error">
        <XCircle className="h-5 w-5" />
        <span className="text-sm font-medium">Deployment failed</span>
      </div>
      {error && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  )
}
