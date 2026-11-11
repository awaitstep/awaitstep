import { timeAgo } from '../../../lib/time'
import { cn } from '../../../lib/utils'
import { runCurl } from '../../../lib/workflows/run-endpoint'
import type { RunHour } from '../../../types/dashboard/workspaces'
import { CopyCommand } from '../../ui/copy-command'
import { NOT_CALLABLE } from '../function-call'
import { HourBars } from '../../workspaces/parts/hour-bars'

export interface BandLive {
  /** The account's id. */
  accountId: string
  version: number | undefined
  account: string | undefined
  /** When it went out. */
  at: string
}

interface StatusBandProps {
  /** The workflow or function: the API runs it at `/api/run/<id>`. */
  workflowId: string
  /** A live function the API can't call (no URL it will call): its curl would only be refused. */
  notCallable?: boolean
  /** What is live on each account, newest first; empty while nothing is. */
  live: BandLive[]
  /** The newest saved version, for the not-deployed line. */
  latest: { version: number; at: string } | undefined
  /** Runs in the last 24 hours, by result and hour by hour, and whether it ever ran; when known. */
  runs24h?: { all: number; failed: number; byHour: RunHour[]; ranEver?: boolean }
}

const LABEL = 'text-2xs font-medium uppercase tracking-wider text-muted-foreground'
const COLUMN = 'flex min-w-0 flex-col gap-2 px-5 py-4'

/**
 * The band across a workflow's or function's Overview (`WorkflowDetail`,
 * 24a/24f): what is live, how the API runs it, and the day's runs hour by
 * hour. Both kinds read the same.
 */
export function StatusBand({ workflowId, notCallable, live, latest, runs24h }: StatusBandProps) {
  return (
    <section
      aria-label="Status"
      className="flex flex-wrap divide-border rounded-2xl border border-border bg-card md:flex-nowrap md:divide-x"
    >
      <div className={cn(COLUMN, 'basis-[260px] grow-[1.3]')}>
        <LiveColumn live={live} latest={latest} />
      </div>
      <div className={cn(COLUMN, 'basis-[240px] grow')}>
        <span className={LABEL}>Trigger</span>
        <TriggerColumn workflowId={workflowId} live={live.length > 0} notCallable={notCallable} />
      </div>
      <div className={cn(COLUMN, 'basis-[240px] grow')}>
        <RunsColumn runs24h={runs24h} />
      </div>
    </section>
  )
}

function LiveColumn({ live, latest }: Pick<StatusBandProps, 'live' | 'latest'>) {
  if (live.length > 1) return <LiveAccounts live={live} />
  const only = live[0]
  if (!only) {
    return (
      <>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/60" />
          <span className="text-sm font-semibold text-foreground">Not deployed</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {latest ? `v${latest.version} saved ${timeAgo(latest.at)}` : 'Nothing saved yet'}
        </span>
      </>
    )
  }
  const where = only.account ? `on ${only.account}, ${timeAgo(only.at)}` : timeAgo(only.at)
  return (
    <>
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2 rounded-full bg-status-success" />
        <span className="text-sm font-semibold text-foreground">
          {only.version !== undefined ? `Live · v${only.version}` : 'Live'}
        </span>
      </span>
      <span className="text-xs text-muted-foreground">{where}</span>
    </>
  )
}

/** Live on several accounts: each one's version, newest first. */
function LiveAccounts({ live }: { live: BandLive[] }) {
  return (
    <>
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2 rounded-full bg-status-success" />
        <span className="text-sm font-semibold text-foreground">
          Live on {live.length} accounts
        </span>
      </span>
      <ul className="flex flex-col gap-1">
        {live.map((l) => (
          <li key={l.accountId} className="flex min-w-0 items-baseline gap-1.5 text-xs">
            <span className="truncate text-foreground">{l.account ?? 'An account'}</span>
            <span className="font-mono text-muted-foreground">
              {l.version !== undefined ? `v${l.version}` : ''}
            </span>
            <span className="text-muted-foreground">{timeAgo(l.at)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

interface TriggerColumnProps {
  workflowId: string
  live: boolean
  notCallable?: boolean
}

function TriggerColumn({ workflowId, live, notCallable }: TriggerColumnProps) {
  if (live && notCallable) {
    return <span className="text-xs text-muted-foreground">{NOT_CALLABLE}</span>
  }
  if (!live) {
    return (
      <span className="text-xs text-muted-foreground">Runs from the API once it’s deployed.</span>
    )
  }
  return (
    <>
      <CopyCommand command={runCurl(workflowId)} label="Copy the curl command" />
      <span className="text-xs text-muted-foreground">
        POST with an API key that can run it. Each call shows in Runs.
      </span>
    </>
  )
}

function RunsColumn({ runs24h }: Pick<StatusBandProps, 'runs24h'>) {
  const none = !runs24h || runs24h.all === 0
  return (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className={LABEL}>Runs, 24h</span>
        {/* Nothing until the day's runs are in. */}
        {runs24h && (
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {none ? '—' : runs24h.all}
            </span>
            <span
              className={cn(
                'text-xs',
                !none && runs24h.failed > 0 ? 'text-status-error' : 'text-muted-foreground',
              )}
            >
              {runsLine(runs24h)}
            </span>
          </span>
        )}
      </span>
      {runs24h && (
        <HourBars
          hours={runs24h.byHour}
          label={none ? runsLine(runs24h) : 'Runs over the last 24 hours'}
          className="h-[26px]"
        />
      )}
    </>
  )
}

/** "3 failed", "None failed", or with none today, whether it ever ran. */
function runsLine(runs: { all: number; failed: number; ranEver?: boolean }): string {
  if (runs.all === 0) return runs.ranEver ? 'None in 24h' : 'No runs yet'
  return failedLine(runs.failed)
}

function failedLine(failed: number): string {
  return failed === 0 ? '0 failed' : `${failed} failed`
}
