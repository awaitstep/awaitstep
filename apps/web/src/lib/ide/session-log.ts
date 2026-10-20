import type { TestSession } from '../api-client'

export type RunAction =
  | { kind: 'start'; label: string }
  | { kind: 'stop'; label: string }
  | { kind: 'busy'; label: string }

/**
 * What the Run button should offer for a session's state.
 *
 * Only the start and stop requests make it busy — a trigger must not, or a
 * handler that never returns leaves the user unable to stop the session
 * running it. A session that is starting offers neither: pressing Run again
 * there is how a user ends up with two.
 */
export function runAction(
  session: TestSession | null,
  pending: { starting: boolean; stopping: boolean },
): RunAction {
  if (pending.starting) return { kind: 'busy', label: 'Starting…' }
  if (pending.stopping) return { kind: 'busy', label: 'Stopping…' }
  if (!session) return { kind: 'start', label: 'Run' }
  switch (session.status) {
    case 'starting':
      return { kind: 'busy', label: 'Starting…' }
    case 'running':
      return { kind: 'stop', label: 'Stop' }
    default:
      return { kind: 'start', label: 'Run' }
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
  if (session.status !== 'running') return session.error ?? 'Test session stopped'
  // A lost stream matters more than where the session runs: it is why the
  // output has stopped moving.
  if (options.streamError) return options.streamError
  // Stale beats healthy: the user is looking at code this session is not
  // running, and Run is what fixes it.
  if (options.stale) return 'Running an older version — press Run to restart'
  return `Running on ${session.runtime === 'sandbox' ? 'a container' : 'this machine'}`
}
