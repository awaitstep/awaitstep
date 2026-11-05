import { Check, Copy, Link2 } from 'lucide-react'
import { useCopyStatus } from '../../ui/use-copy-status'
import { OverviewCard } from '../../workspaces/parts/overview-card'

interface TriggerCardProps {
  /** The live worker's URL; none while nothing is deployed. */
  url: string | null | undefined
}

/**
 * Trigger (`WorkflowDetail`): where a POST starts a run. The worker's own URL,
 * the only one there is, so the card shows only once something is live.
 */
export function TriggerCard({ url }: TriggerCardProps) {
  const copy = useCopyStatus(url ?? undefined)
  if (!url) return null
  const shown = url.replace(/^https?:\/\//, '')
  const copied = copy.status === 'copied'
  const copyLabel = { idle: 'Copy', copied: 'Copied', failed: 'Couldn’t copy' }[copy.status]

  function handleCopy() {
    void copy.copy()
  }

  return (
    <OverviewCard title="Trigger" caption="Worker URL">
      <div className="flex flex-col gap-2.5 px-5 py-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Link2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{shown}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-status-success"
          >
            {copied ? (
              <Check aria-hidden="true" className="size-3" />
            ) : (
              <Copy aria-hidden="true" className="size-3" />
            )}
            {copyLabel}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">POST to run it.</p>
      </div>
    </OverviewCard>
  )
}
