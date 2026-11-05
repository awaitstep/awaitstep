import { useState } from 'react'
import { Play, Square, Send } from 'lucide-react'
import type { TestSessionState } from '../../hooks/use-test-session'
import { canTrigger, runAction, sessionSummary } from '../../lib/ide/session-log'
import {
  describeSavedChanges,
  describeUnsaved,
  isBehind,
  savedChangeCount,
} from '../../lib/ide/session-staleness'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { cn } from '../../lib/utils'

/**
 * Starting, stopping and triggering a test session. The payload is free text
 * rather than a form: a trigger is an HTTP body, and the shapes workflows
 * accept are their own.
 */
export function RunPanel({
  session: state,
  onSaveAll,
}: {
  session: TestSessionState
  onSaveAll: () => Promise<number>
}) {
  const {
    session,
    starting,
    stopping,
    triggering,
    stale,
    streamError,
    actionError,
    lastResult,
    payload,
    setPayload,
    start,
    stop,
    trigger,
    restart,
    restartAndTrigger,
    acceptedSignature,
    acceptStale,
  } = state
  const [payloadError, setPayloadError] = useState<string | null>(null)
  const [pendingPayload, setPendingPayload] = useState<{ value: unknown } | null>(null)
  const savedLine = session ? describeSavedChanges(stale, session.createdAt) : null
  const versionLine =
    session?.status === 'running' && stale.version && !savedLine
      ? 'A newer version was saved after this session started.'
      : null
  const unsavedLine = session?.status === 'running' ? describeUnsaved(stale) : null
  const behind = isBehind(stale) && stale.signature !== acceptedSignature

  const action = runAction(session, { starting, stopping })
  // Deliberately not gated on `starting`/`stopping`: a trigger in flight must
  // never be what stops someone pressing Stop.
  const triggerable = canTrigger(session) && !triggering

  function handleAction() {
    if (action.kind === 'start') void start()
    if (action.kind === 'stop') void stop()
  }

  function handleTrigger() {
    let parsed: unknown
    try {
      parsed = payload.trim() ? JSON.parse(payload) : {}
    } catch {
      // Said here rather than as a toast: the text being judged is on screen.
      setPayloadError('Not valid JSON')
      return
    }
    setPayloadError(null)
    if (behind && canTrigger(session)) {
      setPendingPayload({ value: parsed })
      return
    }
    void trigger(parsed)
  }

  function handleRestart() {
    void restart()
  }

  // Saving first is the point: if any file failed to save (a conflict, a
  // limit) it has said why, and restarting without it would test other code
  // than the person asked for.
  function saveEverything(): Promise<boolean> {
    const pending = stale.unsaved
    return onSaveAll().then((saved) => saved >= pending)
  }

  function handleSaveAndRestart() {
    void saveEverything().then((ok) => {
      if (ok) void restart()
    })
  }

  function handleAskOpenChange(open: boolean) {
    if (!open) setPendingPayload(null)
  }

  function handleTriggerAnyway() {
    if (!pendingPayload) return
    acceptStale(stale.signature)
    const { value } = pendingPayload
    setPendingPayload(null)
    void trigger(value)
  }

  function handleRestartAndTrigger() {
    if (!pendingPayload) return
    const { value } = pendingPayload
    setPendingPayload(null)
    void saveEverything().then((ok) => {
      if (ok) void restartAndTrigger(value)
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={action.kind === 'stop' ? 'outline' : 'default'}
          disabled={action.kind === 'busy'}
          onClick={handleAction}
        >
          {action.kind === 'stop' ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {action.label}
        </Button>
        <span
          className={cn(
            'text-xs',
            streamError || stale.version ? 'text-status-warning' : 'text-muted-foreground',
          )}
        >
          {sessionSummary(session, { stale: stale.version, streamError })}
        </span>
      </div>
      {savedLine && <StalenessLine text={savedLine} action="Restart" onAction={handleRestart} />}
      {versionLine && (
        <StalenessLine text={versionLine} action="Restart" onAction={handleRestart} />
      )}
      {unsavedLine && (
        <StalenessLine
          text={unsavedLine}
          action="Save and restart"
          onAction={handleSaveAndRestart}
        />
      )}
      {actionError && (
        <p role="alert" className="text-[11px] text-destructive">
          {actionError}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <label htmlFor="trigger-payload" className="text-[11px] text-muted-foreground/70">
          Trigger payload
        </label>
        <textarea
          id="trigger-payload"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          spellCheck={false}
          className={cn(
            'min-h-16 flex-1 resize-none rounded-md border border-input bg-editor p-2 font-mono text-xs',
            payloadError && 'border-destructive',
          )}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-destructive">{payloadError}</span>
          <Button size="sm" variant="outline" disabled={!triggerable} onClick={handleTrigger}>
            <Send className="h-3.5 w-3.5" />
            {triggering ? 'Running…' : 'Trigger'}
          </Button>
        </div>
      </div>

      {lastResult && (
        <div className="min-h-0 shrink-0 overflow-auto rounded-md border border-border bg-card p-2">
          <div className="mb-1 text-[11px] text-muted-foreground/70">
            Response: {lastResult.status}
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">
            {formatBody(lastResult.body)}
          </pre>
        </div>
      )}
      <ConfirmDialog
        open={pendingPayload !== null}
        onOpenChange={handleAskOpenChange}
        title="This session is running older code"
        description={askDescription(
          savedLine,
          savedChangeCount(stale),
          stale.version,
          stale.unsaved,
        )}
        confirmLabel={stale.unsaved > 0 ? 'Save, restart and trigger' : 'Restart and trigger'}
        variant="default"
        secondaryLabel="Trigger anyway"
        onSecondary={handleTriggerAnyway}
        onConfirm={handleRestartAndTrigger}
      />
    </div>
  )
}

function StalenessLine({
  text,
  action,
  onAction,
}: {
  text: string
  action: string
  onAction: () => void
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border border-status-warning/30 bg-tone-warn px-2.5 py-1.5 text-xs text-foreground/80"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning" />
      <span className="flex-1">{text}</span>
      <Button size="sm" variant="outline" onClick={onAction} className="h-6 px-2 text-xs">
        {action}
      </Button>
    </div>
  )
}

function askDescription(
  savedLine: string | null,
  savedCount: number,
  version: boolean,
  unsaved: number,
): string {
  const why = savedCount > 0 && savedLine ? savedLine : version ? 'A newer version was saved.' : ''
  const files = unsaved === 1 ? '1 unsaved file' : `${unsaved} unsaved files`
  const save = unsaved > 0 ? ` Restarting saves ${files} first.` : ''
  return `${why} Triggering now tests the old code.${save}`.trim()
}

/**
 * A worker can answer with anything. A string is shown as it came — an HTML
 * error page or a stack trace put through JSON.stringify becomes one escaped
 * line, which is exactly when it matters most.
 */
function formatBody(body: unknown): string {
  if (body === null || body === undefined) return ''
  if (typeof body === 'string') return body
  return JSON.stringify(body, null, 2)
}
