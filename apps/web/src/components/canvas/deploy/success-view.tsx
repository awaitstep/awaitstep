import { useState } from 'react'
import { CheckCircle2, ExternalLink, Copy, Check } from 'lucide-react'
import { Button } from '../../ui/button'
import type { DeployResult } from '../../../hooks/use-deploy-stream'

interface SuccessViewProps {
  result: DeployResult | null
  connectionName?: string
  onClose: () => void
}

export function SuccessView({ result, connectionName, onClose }: SuccessViewProps) {
  const [curlCopied, setCurlCopied] = useState(false)

  function handleCopyCurl() {
    if (!result?.url) return
    navigator.clipboard.writeText(`curl -X POST ${result.url}`)
    setCurlCopied(true)
    setTimeout(() => setCurlCopied(false), 2000)
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-2 text-status-success">
        <CheckCircle2 className="h-5 w-5" />
        <span className="text-sm font-medium">Deployed successfully</span>
      </div>

      {result && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Worker</span>
            <span className="font-mono text-xs text-foreground/70">{result.deploymentId}</span>
          </div>
          {connectionName && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Connection</span>
              <span className="text-xs text-foreground/70">{connectionName}</span>
            </div>
          )}
          {result.dashboardUrl && (
            <a
              href={result.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View in Dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {result?.url && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Trigger</span>
            <button
              onClick={handleCopyCurl}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
            >
              {curlCopied ? (
                <Check className="h-3 w-3 text-status-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {curlCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
            {`curl -X POST ${result.url}`}
          </pre>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}
