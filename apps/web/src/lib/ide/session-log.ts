import type { TestSession } from '../api-client'
import type { SessionLogLine } from '../../stores/test-session-store'

export type RunAction =
  | { kind: 'start'; label: string }
  | { kind: 'stop'; label: string }
  /** The session exists but is still coming up: stopping it is how to give up. */
  | { kind: 'cancel'; label: string }
  | { kind: 'busy'; label: string }

/** The server's limit on a trigger payload (`MAX_PAYLOAD_BYTES` in routes/test-sessions.ts). */
export const MAX_TRIGGER_PAYLOAD_BYTES = 102_400

/**
 * What the Run button should offer for a session's state.
 *
 * Only the start and stop requests make it busy — a trigger must not, or a
 * handler that never returns leaves the user unable to stop the session
 * running it. A session that is starting offers Cancel and not Start:
 * pressing Start again there is how a user ends up with two.
 */
export function runAction(
  session: TestSession | null,
  pending: { starting: boolean; stopping: boolean },
): RunAction {
  if (pending.stopping) return { kind: 'busy', label: 'Stopping…' }
  // No session id yet while the request is in flight, so there is nothing to cancel.
  if (pending.starting && session?.status !== 'starting') {
    return { kind: 'busy', label: 'Starting…' }
  }
  if (!session) return { kind: 'start', label: 'Start' }
  switch (session.status) {
    case 'starting':
      return { kind: 'cancel', label: 'Cancel' }
    case 'running':
      return { kind: 'stop', label: 'Stop' }
    default:
      return { kind: 'start', label: 'Start' }
  }
}

/** Whether a session can take a trigger right now. */
export function canTrigger(session: TestSession | null): boolean {
  return session?.status === 'running'
}

/**
 * A short description of where a session is, for the status line. Reads the
 * session's own error when it has one — a session that stopped because it was
 * idle should say so rather than "stopped".
 */
export function sessionSummary(
  session: TestSession | null,
  options: { stale?: boolean; streamError?: string | null } = {},
): string {
  if (!session) return 'No test session'
  if (session.status === 'starting') return 'Starting a test session…'
  if (session.status !== 'running') {
    return (
      session.error ??
      (session.status === 'failed' ? 'Test session failed to start' : 'Test session stopped')
    )
  }
  // A lost stream matters more than where the session runs: it is why the
  // output has stopped moving.
  if (options.streamError) return options.streamError
  // Stale beats healthy: the user is looking at code this session is not
  // running, and Run is what fixes it.
  if (options.stale) return 'Running an older version of this workflow.'
  return `Running on ${session.runtime === 'sandbox' ? 'a container' : 'this machine'}`
}

export type StartPhase = 'preparing' | 'starting'

/**
 * Which step of a start the browser can see: the request is in flight
 * (`preparing`), or the session exists and is coming up (`starting`). Null
 * when nothing is starting. There is nothing finer to report, so there is no
 * percentage.
 */
export function startPhase(
  session: TestSession | null,
  pending: { starting: boolean },
): StartPhase | null {
  if (session?.status === 'starting') return 'starting'
  return pending.starting ? 'preparing' : null
}

/** The line shown while a session starts. */
export function startPhaseLabel(phase: StartPhase, runtime: TestSession['runtime'] | null): string {
  if (phase === 'preparing') return 'Preparing your files…'
  return runtime === 'node' ? 'Starting on this machine…' : 'Starting the container…'
}

/** Whole seconds from `sinceMs` to `nowMs`, never negative (clocks drift). */
export function elapsedSeconds(nowMs: number, sinceMs: number): number {
  return Math.max(0, Math.floor((nowMs - sinceMs) / 1000))
}

export type LogStreamFilter = 'all' | 'stderr'

/**
 * The lines a view shows: those after the last Clear view, from the chosen
 * stream, containing the filter text (case-insensitive).
 */
export function filterLogLines(
  lines: readonly SessionLogLine[],
  options: { clearedBefore: number; stream: LogStreamFilter; text: string },
): SessionLogLine[] {
  const needle = options.text.trim().toLowerCase()
  return lines.filter(
    (line) =>
      line.id > options.clearedBefore &&
      (options.stream === 'all' || line.stream === 'stderr') &&
      (needle === '' || line.text.toLowerCase().includes(needle)),
  )
}

/** Lines on stderr — the count the stderr chip shows. */
export function countStderr(lines: readonly SessionLogLine[]): number {
  let count = 0
  for (const line of lines) if (line.stream === 'stderr') count++
  return count
}

/** Local wall-clock time with milliseconds, `HH:MM:SS.mmm`. */
export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

/** `HH:MM` in the viewer's locale, for "as of 14:01". */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export type TriggerPayload = { ok: true; value: unknown } | { ok: false; error: string }

/**
 * The trigger payload text as a value, or why it can't be sent. Size is
 * judged the way the server does: the length of the parsed value serialized.
 */
export function parseTriggerPayload(text: string): TriggerPayload {
  let value: unknown
  try {
    value = text.trim() ? JSON.parse(text) : {}
  } catch {
    return { ok: false, error: 'Not valid JSON' }
  }
  const size = JSON.stringify(value)?.length ?? 0
  if (size > MAX_TRIGGER_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: `Payload must be under ${MAX_TRIGGER_PAYLOAD_BYTES / 1024} KB · this one is ${Math.ceil(size / 1024)} KB`,
    }
  }
  return { ok: true, value }
}
