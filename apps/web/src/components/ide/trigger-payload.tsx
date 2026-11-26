import { useState } from 'react'
import { ChevronDown, ChevronRight, Send } from 'lucide-react'
import type { TestSessionState } from '../../hooks/use-test-session'
import { MAX_TRIGGER_PAYLOAD_BYTES, canTrigger } from '../../lib/ide/session-log'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { PANE_HEADER, formatBody } from './session-bars'

const LIMIT = `up to ${MAX_TRIGGER_PAYLOAD_BYTES / 1024} KB`

/**
 * The trigger payload and the response. The payload is free text rather than
 * a form: a trigger is an HTTP body, and the shapes workflows accept are
 * their own.
 */
export function TriggerPayload({
  state,
  onTrigger,
}: {
  state: TestSessionState
  onTrigger: () => void
}) {
  const { session, payload, payloadError, lastResult, triggering, setPayload, setPayloadError } =
    state
  const [responseOpen, setResponseOpen] = useState(true)
  // Deliberately not gated on `starting`/`stopping`: a trigger in flight must
  // never be what stops someone pressing Stop.
  const triggerable = canTrigger(session) && !triggering

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setPayload(event.target.value)
    if (payloadError) setPayloadError(null)
  }

  function handleToggleResponse() {
    setResponseOpen((open) => !open)
  }

  const ok = lastResult !== null && lastResult.status >= 200 && lastResult.status < 300

  return (
    <div className="flex min-h-0 flex-col">
      <div className={PANE_HEADER}>
        <label htmlFor="trigger-payload" className="text-2xs font-medium text-foreground">
          Trigger payload <span className="font-normal text-muted-foreground">· {LIMIT}</span>
        </label>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-6 px-2 text-2xs"
          disabled={!triggerable}
          onClick={onTrigger}
        >
          <Send className="h-3 w-3" />
          {triggering ? 'Running…' : 'Trigger'}
        </Button>
      </div>
      <textarea
        id="trigger-payload"
        data-ide-run-field=""
        value={payload}
        onChange={handleChange}
        spellCheck={false}
        aria-invalid={payloadError !== null}
        aria-describedby={payloadError ? 'trigger-payload-error' : undefined}
        className="min-h-14 flex-1 resize-none bg-editor p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      />
      {payloadError && (
        <p
          id="trigger-payload-error"
          role="alert"
          className="shrink-0 border-t border-destructive/40 px-3 py-1 text-2xs text-destructive"
        >
          {payloadError}
        </p>
      )}
      {lastResult && (
        <div className="min-h-0 shrink-0 overflow-auto border-t border-border bg-card">
          <button
            type="button"
            onClick={handleToggleResponse}
            aria-expanded={responseOpen}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-2xs text-muted-foreground hover:text-foreground"
          >
            {responseOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Response
            <span className={cn('font-medium', ok ? 'text-status-success' : 'text-status-error')}>
              · {lastResult.status}
            </span>
          </button>
          {responseOpen && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-2 font-mono text-xs">
              {formatBody(lastResult.body)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
