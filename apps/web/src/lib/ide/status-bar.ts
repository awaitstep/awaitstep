import type { TestSession } from '../api-client'
import { isBehind, savedChangeCount, type SessionStaleness } from './session-staleness'

export type StatusTone = 'idle' | 'ok' | 'warn' | 'info' | 'error'

export interface SessionStatus {
  tone: StatusTone
  label: string
}

/**
 * What the status bar says about the test session. A session that is behind
 * says why in a word: saves made after it started, or a newer version.
 */
export function sessionStatus(
  session: TestSession | null,
  staleness: SessionStaleness,
  pending: { starting: boolean; stopping: boolean },
): SessionStatus {
  if (pending.starting) return { tone: 'info', label: 'Test session · starting…' }
  if (pending.stopping) return { tone: 'idle', label: 'Test session · stopping…' }
  if (!session) return { tone: 'idle', label: 'No test session' }
  switch (session.status) {
    case 'starting':
      return { tone: 'info', label: 'Test session · starting…' }
    case 'failed':
      return { tone: 'error', label: 'Test session · failed to start' }
    case 'stopped':
      return { tone: 'idle', label: 'Test session · stopped' }
    default:
      if (!isBehind(staleness)) return { tone: 'ok', label: 'Test session · running' }
      return {
        tone: 'warn',
        label:
          savedChangeCount(staleness) > 0
            ? 'Test session · behind your saves'
            : 'Test session · older version',
      }
  }
}

/** "2 unsaved ›", or null when nothing is. */
export function unsavedLabel(count: number): string | null {
  return count === 0 ? null : `${count} unsaved ›`
}
