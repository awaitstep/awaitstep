import { Send } from 'lucide-react'
import type { TestSessionState } from '../../hooks/use-test-session'
import { MAX_TRIGGER_PAYLOAD_BYTES, canTrigger } from '../../lib/ide/session-log'
import { Button } from '../ui/button'
import { PANE_HEADER } from './session-bars'

const LIMIT = `up to ${MAX_TRIGGER_PAYLOAD_BYTES / 1024} KB`

/**
 * The trigger payload. It is free text rather than a form: a trigger is an
 * HTTP body, and the shapes workflows accept are their own. What the trigger
 * answers is a line of the output beside it.
 */
export function TriggerPayload({
  state,
  onTrigger,
}: {
  state: TestSessionState
  onTrigger: () => void
}) {
  const { session, payload, payloadError, triggering, setPayload, setPayloadError } = state
  // Deliberately not gated on `starting`/`stopping`: a trigger in flight must
  // never be what stops someone pressing Stop.
  const triggerable = canTrigger(session) && !triggering

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setPayload(event.target.value)
    if (payloadError) setPayloadError(null)
  }

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
    </div>
  )
}
