import type { RunSummary } from '../../../lib/api-client'
import { timeAgo } from '../../../lib/time'
import { cn } from '../../../lib/utils'
import { RESULT_DOT_CLASS, RESULT_LABEL, tookLabel } from '../../runs/run-format'
import { ShellLink } from '../../ui/shell-link'
import { OverviewCard } from '../../workspaces/parts/overview-card'
import { Play } from 'lucide-react'
import { CardEmpty } from './card-empty'
import { runDurationMs, runResult } from '../run-result'

const SHOWN = 6

interface RecentRunsCardProps {
  runs: RunSummary[]
  /** Never deployed: the empty state says what comes first (24f). */
  neverDeployed?: boolean
  /** The Runs tab. */
  runsHref: string
  runHref: (runId: string) => string
  /** A function: calls to its URL aren't recorded. */
  isFunction?: boolean
}

/** Recent runs (`WorkflowDetail`): the latest five, each opening its run; All runs → the Runs tab. */
export function RecentRunsCard({
  runs,
  neverDeployed,
  runsHref,
  runHref,
  isFunction = false,
}: RecentRunsCardProps) {
  if (isFunction) {
    return (
      <OverviewCard title="Recent requests" caption="Not recorded">
        <CardEmpty
          icon={<Play />}
          title="No requests to show"
          body="Calls to its URL aren’t kept."
        />
      </OverviewCard>
    )
  }

  const action = (
    <ShellLink href={runsHref} className="text-xs font-medium text-status-success">
      All runs →
    </ShellLink>
  )

  return (
    <OverviewCard
      title="Recent runs"
      caption={runs.length === 0 ? 'None yet' : undefined}
      action={runs.length > 0 ? action : undefined}
    >
      {runs.length === 0 ? (
        <CardEmpty
          icon={<Play />}
          title="No runs yet"
          body={neverDeployed ? 'Deploy it, then trigger a run.' : 'Trigger it to see runs here.'}
        />
      ) : (
        <ul className="divide-y divide-border">
          {runs.slice(0, SHOWN).map((run) => {
            const result = runResult(run.status)
            return (
              <li key={run.id}>
                <ShellLink
                  href={runHref(run.id)}
                  className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-muted/30"
                >
                  <span
                    aria-hidden="true"
                    className={cn('size-2 shrink-0 rounded-full', RESULT_DOT_CLASS[result])}
                  />
                  <span className="flex-1 text-foreground">{RESULT_LABEL[result]}</span>
                  <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                    {tookLabel(runDurationMs(run))}
                  </span>
                  <span className="w-16 text-right text-xs text-muted-foreground">
                    {timeAgo(run.createdAt)}
                  </span>
                </ShellLink>
              </li>
            )
          })}
        </ul>
      )}
    </OverviewCard>
  )
}
