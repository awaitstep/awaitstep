import { Check, Copy, Loader2, RotateCw, TriangleAlert } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { Tile } from './tile'
import { useCopyStatus } from './use-copy-status'

interface LoadErrorProps {
  /** "We couldn't load workflows". */
  title: string
  /** What happened and what to do, e.g. "The server took too long to answer. Nothing was changed." */
  detail: string
  onRetry: () => void
  /** While a retry is in flight: spinner, `aria-busy`, further clicks ignored. */
  retrying?: boolean
  /** Retries so far; from 1 the button reads "Try again (n)". */
  attempts?: number
  statusHref?: string
  /** The request ID support needs, e.g. `req_7f2a91c4`. */
  errorId?: string
  /** `false` drops the card, for use inside a section that draws its own. */
  framed?: boolean
}

/** What a list shows in place of its rows when loading it failed. */
export function LoadError({
  title,
  detail,
  onRetry,
  retrying = false,
  attempts = 0,
  statusHref,
  errorId,
  framed = true,
}: LoadErrorProps) {
  const { status: copyStatus, copy: copyErrorId } = useCopyStatus(errorId)
  const copied = copyStatus === 'copied'

  function handleRetry() {
    if (!retrying) onRetry()
  }

  async function handleCopyId() {
    await copyErrorId()
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3.5 px-6 py-14 text-center',
        framed && 'rounded-2xl border border-border bg-card',
      )}
    >
      <Tile tone="fail" size="lg">
        <TriangleAlert />
      </Tile>
      <div role="alert" className="flex flex-col items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="max-w-[440px] text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button
          type="button"
          onClick={handleRetry}
          aria-busy={retrying || undefined}
          aria-disabled={retrying || undefined}
          className={cn(retrying && 'opacity-70')}
        >
          {retrying ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RotateCw aria-hidden="true" />
          )}
          {attempts > 0 ? `Try again (${attempts})` : 'Try again'}
        </Button>
        {statusHref && (
          <Button asChild variant="outline">
            <a href={statusHref} target="_blank" rel="noreferrer">
              Status page ↗
            </a>
          </Button>
        )}
      </div>
      {errorId && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-2xs text-muted-foreground">
          <span>Error ID</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground/80">
            {errorId}
          </code>
          <button
            type="button"
            onClick={handleCopyId}
            aria-label={`Copy error ID ${errorId}`}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
          </button>
          <span>· include it if you contact support</span>
          <span
            role="status"
            className={copyStatus === 'failed' ? 'basis-full text-status-error' : 'sr-only'}
          >
            {copied && 'Copied'}
            {copyStatus === 'failed' && 'Couldn’t copy. Select the ID and copy it yourself.'}
          </span>
        </div>
      )}
    </div>
  )
}
