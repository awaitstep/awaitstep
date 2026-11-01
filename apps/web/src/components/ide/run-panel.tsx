import { useState } from 'react'
import { Play, Square, Send } from 'lucide-react'
import type { TestSessionState } from '../../hooks/use-test-session'
import { canTrigger, runAction, sessionSummary } from '../../lib/ide/session-log'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

/**
 * Starting, stopping and triggering a test session. The payload is free text
 * rather than a form: a trigger is an HTTP body, and the shapes workflows
 * accept are their own.
 */
export function RunPanel({ session: state }: { session: TestSessionState }) {
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
  } = state
  const [payloadError, setPayloadError] = useState<string | null>(null)

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
    void trigger(parsed)
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
            streamError || stale ? 'text-status-warning' : 'text-muted-foreground',
          )}
        >
          {sessionSummary(session, { stale, streamError })}
        </span>
      </div>
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
    </div>
  )
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
