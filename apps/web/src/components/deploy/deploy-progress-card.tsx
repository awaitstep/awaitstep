import { Check, CircleHelp, Loader2, Minus, X } from 'lucide-react'
import { timeAgo } from '../../lib/time'
import { cn } from '../../lib/utils'
import { Button, buttonVariants } from '../ui/button'
import { RouterShellLink } from '../navigation/router-shell-link'
import {
  cancellableAt,
  cancelledAtLine,
  deployPhases,
  failedBeforeUpload,
  stoppedAtLine,
  type DeployOutcome,
  type DeployPhaseKey,
  type DeployPhaseState,
} from './deploy-phases'
import { FailureDetails, LiveLinks } from './deploy-progress-parts'

interface DeployProgressCardProps {
  outcome: DeployOutcome
  /** The phase of the last stage reached; null before the first. */
  reached: DeployPhaseKey | null
  version: number | undefined
  accountName: string | undefined
  /** "Cloudflare": who answered with the error. */
  providerName: string
  startedAt: number | null
  finishedAt: number | null
  /** What the API runs once it's live, and the provider's page for the worker. */
  workflowId: string
  dashboardUrl: string | undefined
  kind: 'workflow' | 'script' | undefined
  error: string | null
  /** The version that was live on the account before; it keeps serving after an early failure. */
  liveVersion: number | null
  deploymentsHref: string
  overviewHref: string
  onRetry: () => void
  onBack: () => void
  /** The page knows which deploy is running, so it can ask to stop it. */
  canCancel: boolean
  /** A cancel request is on its way: the button waits, nothing is claimed yet. */
  cancelPending: boolean
  /** A cancel was asked for and accepted; the deploy is stopping. */
  cancelling: boolean
  onCancel: () => void
}

function seconds(from: number | null, to: number | null): string | null {
  if (from === null || to === null) return null
  return `${Math.max(1, Math.round((to - from) / 1000))}s`
}

/** A deploy under way, live, failed or cancelled, in place of the summary (25d–25i). */
export function DeployProgressCard(props: DeployProgressCardProps) {
  const { outcome, reached, version, accountName, startedAt, finishedAt } = props
  const v = version !== undefined ? `v${version}` : 'This version'
  const phases = deployPhases(reached, outcome)
  const notes: Record<DeployPhaseKey, string> = {
    compile: 'Code and bindings ready',
    create: accountName ? `On ${accountName}` : 'On the account',
    live: version !== undefined ? `Serving v${version}` : 'Serving it',
  }

  let title: string
  let sub: string
  if (outcome === 'success') {
    title = `${v} is live`
    const took = seconds(startedAt, finishedAt)
    sub = finishedAt
      ? `Deployed ${timeAgo(new Date(finishedAt))}${took ? ` · ${took}` : ''}`
      : 'Deployed'
  } else if (outcome === 'error') {
    title = 'Deploy failed'
    sub = stoppedAtLine(reached)
  } else if (outcome === 'lost') {
    title = 'Lost the connection'
    sub = 'It may still be deploying. Check Deployments before you deploy again.'
  } else if (outcome === 'cancelled') {
    title = 'Deploy cancelled'
    sub = cancelledAtLine(reached)
  } else {
    title = props.cancelling ? `Cancelling ${v}` : `Deploying ${v}`
    sub = startedAt ? `Started ${timeAgo(new Date(startedAt))}` : 'Starting'
  }

  // Before the upload the provider wasn't asked: the refusal is ours (bad
  // settings, a compile error), and the account is as it was.
  const early = failedBeforeUpload(reached)
  const failureHeading = early ? 'What went wrong' : `What ${props.providerName} said`
  const untouchedVersion = early ? props.liveVersion : null

  return (
    <section
      aria-label="Deploy progress"
      aria-live="polite"
      className={cn(
        'flex flex-col overflow-hidden rounded border bg-card',
        outcome === 'success' && 'border-status-success/40',
        outcome === 'error' && 'border-status-error/40',
        (outcome === 'deploying' || outcome === 'lost' || outcome === 'cancelled') &&
          'border-border',
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <OutcomeMark outcome={outcome} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">{sub}</span>
        </span>
      </div>
      <ol className="flex flex-col py-1.5">
        {phases.map((phase) => (
          <li key={phase.key} className="flex items-start gap-3 px-5 py-2">
            <PhaseMark state={phase.state} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  'text-sm font-medium',
                  phase.state === 'idle' && 'text-muted-foreground/70',
                  phase.state === 'failed' && 'text-status-error',
                  phase.state === 'stopped' && 'text-muted-foreground',
                  phase.state !== 'idle' &&
                    phase.state !== 'failed' &&
                    phase.state !== 'stopped' &&
                    'text-foreground',
                )}
              >
                {phase.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {phaseNote(phase.state, notes[phase.key])}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {outcome === 'success' && (
        <LiveLinks
          workflowId={props.workflowId}
          dashboardUrl={props.dashboardUrl}
          kind={props.kind}
          providerName={props.providerName}
        />
      )}
      {outcome === 'error' && (
        <FailureDetails
          error={props.error}
          heading={failureHeading}
          untouchedVersion={untouchedVersion}
        />
      )}
      <ProgressActions {...props} />
    </section>
  )
}

function OutcomeMark({ outcome }: { outcome: DeployOutcome }) {
  if (outcome === 'deploying') {
    return (
      <span
        aria-hidden="true"
        className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-status-warning/15 text-status-warning"
      >
        <Loader2 className="size-4 animate-spin" />
      </span>
    )
  }
  if (outcome === 'lost' || outcome === 'cancelled') {
    return (
      <span
        aria-hidden="true"
        className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-muted text-muted-foreground"
      >
        {outcome === 'lost' ? <CircleHelp className="size-4" /> : <Minus className="size-4" />}
      </span>
    )
  }
  const ok = outcome === 'success'
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[30px] shrink-0 items-center justify-center rounded-[9px]',
        ok ? 'bg-status-success/15 text-status-success' : 'bg-status-error/15 text-status-error',
      )}
    >
      {ok ? <Check className="size-4" /> : <X className="size-4" />}
    </span>
  )
}

function PhaseMark({ state }: { state: DeployPhaseState }) {
  const base = 'mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full'
  if (state === 'done') {
    return (
      <span aria-hidden="true" className={cn(base, 'bg-status-success/15 text-status-success')}>
        <Check className="size-3" />
      </span>
    )
  }
  if (state === 'failed') {
    return (
      <span aria-hidden="true" className={cn(base, 'bg-status-error/15 text-status-error')}>
        <X className="size-3" />
      </span>
    )
  }
  if (state === 'doing') {
    return (
      <span aria-hidden="true" className={cn(base, 'text-status-warning')}>
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    )
  }
  if (state === 'unknown' || state === 'stopped') {
    return (
      <span aria-hidden="true" className={cn(base, 'bg-muted text-muted-foreground')}>
        {state === 'unknown' ? <CircleHelp className="size-3" /> : <Minus className="size-3" />}
      </span>
    )
  }
  return <span aria-hidden="true" className={cn(base, 'border-[1.5px] border-border')} />
}

function phaseNote(state: DeployPhaseState, note: string): string {
  if (state === 'idle') return 'Not reached'
  if (state === 'unknown') return 'No word since'
  if (state === 'stopped') return 'Cancelled here'
  return note
}

function ProgressActions({
  outcome,
  reached,
  providerName,
  deploymentsHref,
  overviewHref,
  onRetry,
  onBack,
  canCancel,
  cancelPending,
  cancelling,
  onCancel,
}: DeployProgressCardProps) {
  // Until the upload starts nothing has reached the provider: it can still stop.
  const showCancel =
    outcome === 'deploying' &&
    (cancelling || cancelPending || (canCancel && cancellableAt(reached)))
  const cancelBusy = cancelling || cancelPending

  let foot: string | null
  if (outcome === 'deploying') {
    foot = cancelling
      ? `Nothing has reached ${providerName}.`
      : 'You can leave this page — it keeps going.'
  } else if (outcome === 'success') foot = 'Now serving every request.'
  else if (outcome === 'lost') foot = null
  else if (outcome === 'cancelled') foot = `Nothing changed on ${providerName}.`
  else foot = failedBeforeUpload(reached) ? `Nothing changed on ${providerName}.` : null

  return (
    <div className="flex flex-col gap-2.5 border-t border-border bg-muted/20 px-5 py-4">
      {outcome === 'deploying' && (
        <Button type="button" size="lg" disabled>
          Deploying…
        </Button>
      )}
      {showCancel && (
        <Button type="button" variant="outline" disabled={cancelBusy} onClick={onCancel}>
          {cancelBusy ? 'Cancelling…' : 'Cancel deploy'}
        </Button>
      )}
      {outcome === 'cancelled' && (
        <>
          <Button type="button" size="lg" onClick={onRetry}>
            Deploy again
          </Button>
          <Button type="button" variant="outline" onClick={onBack}>
            Back to settings
          </Button>
        </>
      )}
      {(outcome === 'success' || outcome === 'lost') && (
        <>
          <RouterShellLink href={deploymentsHref} className={buttonVariants({ size: 'lg' })}>
            View deployments
          </RouterShellLink>
          {outcome === 'success' ? (
            <RouterShellLink
              href={overviewHref}
              className={buttonVariants({ variant: 'outline', className: 'w-full' })}
            >
              Back to the workflow
            </RouterShellLink>
          ) : (
            <Button type="button" variant="outline" onClick={onBack}>
              Back to settings
            </Button>
          )}
        </>
      )}
      {outcome === 'error' && (
        <>
          <Button type="button" size="lg" onClick={onRetry}>
            Retry deploy
          </Button>
          <Button type="button" variant="outline" onClick={onBack}>
            Back to settings
          </Button>
        </>
      )}
      {foot && <span className="text-center text-xs text-muted-foreground">{foot}</span>}
    </div>
  )
}
