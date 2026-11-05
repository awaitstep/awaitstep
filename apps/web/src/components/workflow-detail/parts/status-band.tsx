import { ExternalLink } from 'lucide-react'
import { timeAgo } from '../../../lib/time'
import { cn } from '../../../lib/utils'
import type { RunHour } from '../../../types/dashboard/workspaces'
import { HourBars } from '../../workspaces/parts/hour-bars'
import { CopyUrl } from './copy-url'

export interface BandLive {
  version: number | undefined
  account: string | undefined
  /** When it went out. */
  at: string
  /** The worker's URL, https only; null when there's none to offer. */
  url: string | null
}

interface StatusBandProps {
  /** What is live; none while nothing is. */
  live: BandLive | undefined
  /** The newest saved version, for the not-deployed line. */
  latest: { version: number; at: string } | undefined
  /** Runs in the last 24 hours, by result and hour by hour, and whether it ever ran; when known. */
  runs24h?: { all: number; failed: number; byHour: RunHour[]; ranEver?: boolean }
  /** A function is published and called, and its requests aren't recorded. */
  isFunction?: boolean
}

const LABEL = 'text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground'
const COLUMN = 'flex min-w-0 flex-col gap-2 px-5 py-4'

/**
 * The band across a workflow's or function's Overview (`WorkflowDetail`,
 * 24a/24f): what is live, where a POST runs it, and the day's runs hour by
 * hour (a function's requests aren't recorded, so it says so there).
 */
export function StatusBand({ live, latest, runs24h, isFunction = false }: StatusBandProps) {
  return (
    <section
      aria-label="Status"
      className="flex flex-wrap divide-border rounded-2xl border border-border bg-card md:flex-nowrap md:divide-x"
    >
      <div className={cn(COLUMN, 'basis-[260px] grow-[1.3]')}>
        <LiveColumn live={live} latest={latest} isFunction={isFunction} />
      </div>
      <div className={cn(COLUMN, 'basis-[240px] grow')}>
        <span className={LABEL}>Trigger</span>
        <TriggerColumn url={live?.url ?? null} live={!!live} isFunction={isFunction} />
      </div>
      <div className={cn(COLUMN, 'basis-[240px] grow')}>
        {isFunction ? <RequestsColumn /> : <RunsColumn runs24h={runs24h} />}
      </div>
    </section>
  )
}

function LiveColumn({
  live,
  latest,
  isFunction,
}: Pick<StatusBandProps, 'live' | 'latest'> & { isFunction: boolean }) {
  if (!live) {
    return (
      <>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/60" />
          <span className="text-[15px] font-semibold text-foreground">
            {isFunction ? 'Not published' : 'Not deployed'}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {latest ? `v${latest.version} saved ${timeAgo(latest.at)}` : 'Nothing saved yet'}
        </span>
        <span className="text-xs text-muted-foreground">
          {isFunction ? 'Publish it to get a URL.' : 'Deploy it to get a URL and start running.'}
        </span>
      </>
    )
  }
  const where = live.account ? `on ${live.account}, ${timeAgo(live.at)}` : timeAgo(live.at)
  return (
    <>
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2 rounded-full bg-status-success" />
        <span className="text-[15px] font-semibold text-foreground">
          {live.version !== undefined ? `Live · v${live.version}` : 'Live'}
        </span>
      </span>
      <span className="text-xs text-muted-foreground">{where}</span>
      {live.url && (
        <a
          href={live.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-xs font-medium text-status-success hover:underline"
        >
          Open
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      )}
    </>
  )
}

function TriggerColumn({
  url,
  live,
  isFunction,
}: {
  url: string | null
  live: boolean
  isFunction: boolean
}) {
  // Live, but the deployment gave no https URL to offer.
  if (!url && live) {
    return (
      <span className="text-xs text-muted-foreground">No URL to show for this deployment.</span>
    )
  }
  if (!url) {
    return (
      <span className="text-xs text-muted-foreground">
        {isFunction
          ? 'The URL appears once the function is published.'
          : 'The URL appears once the workflow is deployed.'}
      </span>
    )
  }
  return (
    <>
      <CopyUrl url={url} />
      {/* Runs are recorded when started from AwaitStep (▶ or the API), not by a POST to the worker. */}
      <span className="text-xs text-muted-foreground">
        {isFunction
          ? 'POST to call it.'
          : 'POST to run it. Only runs started from AwaitStep show in Runs.'}
      </span>
    </>
  )
}

/** A function's place for the day's traffic: nothing records its requests. */
function RequestsColumn() {
  return (
    <>
      <span className={LABEL}>Requests, 24h</span>
      <span className="text-xs text-muted-foreground">Not recorded.</span>
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
            <span className="text-[15px] font-semibold tabular-nums text-foreground">
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
  return failed === 0 ? 'None failed' : `${failed} failed`
}
