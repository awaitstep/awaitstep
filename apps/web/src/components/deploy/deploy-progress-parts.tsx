import { ExternalLink } from 'lucide-react'
import { Button } from '../ui/button'
import { useCopyStatus } from '../ui/use-copy-status'

const COPY_LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Couldn’t copy' } as const

const BOX =
  'flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2'

interface LiveLinksProps {
  url: string
  /** The provider's page for the worker, when the deploy gave one. */
  dashboardUrl?: string
  /** A function answers a POST with its return value; a workflow's handlers decide. */
  kind?: 'workflow' | 'script'
  providerName: string
}

/**
 * Where it now runs (25e): the URL, and for a function the curl that calls
 * it. A workflow's fetch handler is its own code, so no command is promised.
 */
export function LiveLinks({ url, dashboardUrl, kind, providerName }: LiveLinksProps) {
  const curl = `curl -X POST ${url}`
  const copy = useCopyStatus(curl)

  function handleCopy() {
    void copy.copy()
  }

  return (
    <div className="flex flex-col gap-2.5 border-t border-border px-5 py-3.5">
      <span className={BOX}>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
          {url.replace(/^https?:\/\//, '')}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-status-success"
        >
          Open
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      </span>
      {kind === 'script' && (
        <>
          <span className={BOX}>
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-foreground">
              {curl}
            </code>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto shrink-0 p-0 text-xs"
              aria-label="Copy the curl command"
              onClick={handleCopy}
            >
              {COPY_LABEL[copy.status]}
            </Button>
          </span>
          <span className="text-xs text-muted-foreground">
            The response body is the function’s return value.
          </span>
        </>
      )}
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
      <pre className="m-0 whitespace-pre-wrap break-words rounded-lg border border-status-error/30 bg-background px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-status-error">
        {error ?? 'The deploy failed without a reason.'}
      </pre>
      {untouchedVersion !== null && (
        <span className="text-xs leading-relaxed text-muted-foreground">
          v{untouchedVersion} is untouched and still serving.
        </span>
      )}
    </div>
  )
}
