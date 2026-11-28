import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import type { RunStepAttempt } from '@awaitstep/codegen'
import type { RunStepExtras } from '../../lib/api-client'
import type { StepItem, StepRowState } from '../../lib/run-step-list'
import { formatDurationMs } from '../../lib/time'
import { cn } from '../../lib/utils'
import { useApi } from '../../contexts/api-client-context'
import { Badge, type BadgeProps } from '../ui/badge'
import { RunCard } from './parts/run-card'
import { stepErrorLine } from './parts/step-rows'

const STATE_CHIP: Record<StepRowState, { label: string; variant: BadgeProps['variant'] }> = {
  done: { label: 'Succeeded', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
  waiting: { label: 'Waiting', variant: 'info' },
  running: { label: 'Running', variant: 'warning' },
  timedOut: { label: 'Timed out', variant: 'warning' },
  interrupted: { label: 'Interrupted', variant: 'neutral' },
}

const SECTION = 'text-xs font-medium text-muted-foreground'

interface RunStepPanelProps {
  workflowId: string
  runId: string
  item: StepItem | undefined
}

/** The selected step (26a/26b): its state, error, output and tries. */
export function RunStepPanel({ workflowId, runId, item }: RunStepPanelProps) {
  if (!item) {
    return (
      <RunCard title="Step">
        <p className="px-4 py-6 text-sm text-muted-foreground">Pick a step to see its details.</p>
      </RunCard>
    )
  }
  return <SelectedStep workflowId={workflowId} runId={runId} item={item} />
}

function SelectedStep({
  workflowId,
  runId,
  item,
}: {
  workflowId: string
  runId: string
  item: StepItem
}) {
  const api = useApi()
  const { step } = item
  const { data: extras, isError } = useQuery({
    // A step's output and tries change only as it moves; its last update keys them.
    queryKey: ['workflow-run-step', workflowId, runId, step.id, step.updatedAt],
    queryFn: () => api.getWorkflowRunStep(workflowId, runId, step.id),
    staleTime: Infinity,
  })

  return <StepDetail item={item} extras={extras} failed={isError} cutAt="64 KB" />
}

interface StepDetailProps {
  item: StepItem
  /** Its output and tries; undefined while they load. */
  extras: RunStepExtras | undefined
  /** The output could not be read. */
  failed?: boolean
  /** Where a cut output was cut, as the note under it says it. */
  cutAt: string
}

/** A step's state, error, output and tries, however they were read. */
export function StepDetail({ item, extras, failed = false, cutAt }: StepDetailProps) {
  const { step, row } = item
  const chip = STATE_CHIP[item.state]
  const error = item.state === 'failed' || item.state === 'timedOut' ? step.error : null

  return (
    <RunCard title={item.name} meta={<span className="font-mono">{item.label}</span>}>
      <div className="flex flex-col gap-3.5 px-4 py-3.5">
        <div className="flex flex-wrap gap-2">
          <Badge variant={chip.variant}>{chip.label}</Badge>
          <Badge variant="neutral">{formatDurationMs(row.durationMs)}</Badge>
          {step.attemptCount > 1 && <Badge variant="warning">{step.attemptCount} attempts</Badge>}
        </div>

        {error && (
          <div className="flex flex-col gap-1.5">
            <span className={SECTION}>Error</span>
            <pre className="whitespace-pre-wrap rounded-lg border border-status-error/25 bg-background p-3 font-mono text-sm leading-relaxed text-status-error">
              {stepErrorLine(error)}
            </pre>
            {errorHint(item) && (
              <span className="text-sm leading-relaxed text-muted-foreground">
                {errorHint(item)}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className={SECTION}>Output</span>
          <StepOutput extras={extras} failed={failed} cutAt={cutAt} />
        </div>

        <AttemptList item={item} attempts={extras?.attempts} />
      </div>
    </RunCard>
  )
}

function StepOutput({
  extras,
  failed,
  cutAt,
}: {
  extras: RunStepExtras | undefined
  failed: boolean
  cutAt: string
}) {
  if (failed) return <span className="text-xs text-status-error">Couldn’t load the output.</span>
  if (!extras) return <span className="text-xs text-muted-foreground">Loading…</span>
  const text = extras.outputTruncated
    ? extras.outputPreview
    : extras.output === null
      ? null
      : JSON.stringify(extras.output, null, 2)
  if (text === null)
    return <span className="text-xs text-muted-foreground">Nothing was returned.</span>
  return (
    <>
      <pre className="max-h-[200px] overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-sm leading-relaxed text-foreground/80">
        {text}
      </pre>
      {extras.outputTruncated && (
        <span className="text-xs text-muted-foreground">Cut at {cutAt}.</span>
      )}
    </>
  )
}

interface AttemptLine {
  label: string
  at: string | undefined
  tone: 'ok' | 'fail' | 'wait' | 'stopped'
}

const DOT: Record<AttemptLine['tone'], string> = {
  ok: 'bg-status-success',
  fail: 'bg-status-error',
  wait: 'bg-status-info',
  stopped: 'bg-muted-foreground/60',
}

/** Newest first: each try with when it ended, or the step's start and end when none were reported. */
function AttemptList({
  item,
  attempts,
}: {
  item: StepItem
  attempts: RunStepAttempt[] | undefined
}) {
  const lines = attemptLines(item, attempts ?? [])
  if (lines.length === 0) return null
  return (
    <ul className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
      {lines.map((line, i) => (
        <li key={i} className="flex items-center gap-2 text-xs">
          <span
            aria-hidden="true"
            className={cn('size-1.5 shrink-0 rounded-full', DOT[line.tone])}
          />
          <span className="flex-1 text-muted-foreground">{line.label}</span>
          {line.at && (
            <span className="font-mono tabular-nums text-muted-foreground/80">
              {format(new Date(line.at), 'HH:mm:ss')}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function attemptLines(item: StepItem, attempts: RunStepAttempt[]): AttemptLine[] {
  const { step } = item
  if (attempts.length > 1 || attempts.some((a) => a.error)) {
    return attempts
      .map((a, i): AttemptLine => {
        const failed = Boolean(a.error)
        const open = !a.end && !failed
        // An unfinished try of a step its run stopped in will never finish.
        const stopped = open && item.state === 'interrupted'
        const word = failed ? 'failed' : stopped ? 'interrupted' : open ? 'running' : 'succeeded'
        return {
          label: `Attempt ${i + 1} · ${word}`,
          at: a.end ?? a.start,
          tone: failed ? 'fail' : stopped ? 'stopped' : open ? 'wait' : 'ok',
        }
      })
      .reverse()
  }
  const lines: AttemptLine[] = []
  if (item.state === 'waiting') {
    lines.push({
      label: step.kind === 'waitForEvent' ? 'Waiting for an event' : 'Sleeping',
      at: undefined,
      tone: 'wait',
    })
  } else if (item.state === 'interrupted') {
    // The run stopped first: a sleep's end is the wake time it never reached.
    lines.push({ label: 'Interrupted', at: undefined, tone: 'stopped' })
  } else if (step.endedAt) {
    lines.push({
      label:
        item.state === 'timedOut' ? 'Timed out' : item.state === 'failed' ? 'Failed' : 'Finished',
      at: step.endedAt,
      tone: item.state === 'failed' ? 'fail' : 'ok',
    })
  }
  if (step.startedAt) lines.push({ label: 'Started', at: step.startedAt, tone: 'ok' })
  return lines
}

function errorHint(item: StepItem): string | null {
  if (item.state === 'timedOut') {
    return 'No event arrived inside the timeout, so the run took the onTimeout branch.'
  }
  if (item.step.attemptCount > 1)
    return `Tried ${item.step.attemptCount} times; this is the last error.`
  return null
}
