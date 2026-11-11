import { ExternalLink } from 'lucide-react'
import { runCurl } from '../../lib/workflows/run-endpoint'
import { CopyCommand } from '../ui/copy-command'

interface LiveLinksProps {
  workflowId: string
  /** The provider's page for the worker, when the deploy gave one. */
  dashboardUrl?: string
  /** A function answers with its own response; a workflow with the run it started. */
  kind?: 'workflow' | 'script'
  providerName: string
}

/**
 * How it runs now (25e): the curl that runs it through the API with a key
 * (D-8), recorded in Runs, and the provider's page for the worker.
 */
export function LiveLinks({ workflowId, dashboardUrl, kind, providerName }: LiveLinksProps) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-border px-5 py-3.5">
      <CopyCommand command={runCurl(workflowId)} label="Copy the curl command" />
      <span className="text-xs text-muted-foreground">
        {kind === 'script'
          ? 'Answers with the function’s own response. Each call shows in Runs.'
          : 'Answers with the run it started. Each run shows in Runs.'}
      </span>
      {dashboardUrl && (
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          View in the {providerName} dashboard
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      )}
    </div>
  )
}

interface FailureDetailsProps {
  error: string | null
  /** "What Cloudflare said" once the provider was reached; our own refusals read "What went wrong". */
  heading: string
  /** The version still serving on the account, when the failure came before the upload. */
  untouchedVersion: number | null
}

/** Why it failed (25f), and what that means for what is live. */
export function FailureDetails({ error, heading, untouchedVersion }: FailureDetailsProps) {
  return (
    <div className="flex flex-col gap-2 border-t border-border px-5 py-3.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {heading}
      </span>
      <pre className="m-0 whitespace-pre-wrap break-words rounded-lg border border-status-error/30 bg-background px-3 py-2.5 font-mono text-sm leading-relaxed text-status-error">
        {error ?? 'The deploy failed without a reason.'}
      </pre>
      {untouchedVersion !== null && (
        <span className="text-sm leading-relaxed text-muted-foreground">
          v{untouchedVersion} is untouched and still serving.
        </span>
      )}
    </div>
  )
}
