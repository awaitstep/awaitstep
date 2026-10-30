import type { Context } from 'hono'
import {
  VERIFY_FAILURE_WINDOW_MS,
  formatWait,
  verifyLockSeconds,
  verifyLockout,
} from '@awaitstep/ir'
import type { AuditEventInsert } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import { auditRows, recordAudit } from './audit.js'

// SA-12: checking credentials locks per person after repeated failures —
// three free, then 30 s doubling to 5 min (D-B7-8). Each check first writes
// a hidden attempt row under the person — a key's creator for a key, so
// minting keys never buys fresh checks — and reads how many others are in
// the window in the same statement: checks still in flight count against
// each other. A valid token withdraws its own attempt; it never clears the
// others, so a token of the caller's own can't reset the count. A person's
// dashboard checks leave out their keys' attempts: whoever holds a key can
// lock that key's checks, never its creator's session. The count lives in
// the audit log, so it holds across Worker isolates.

const ATTEMPT = 'connection.verify.attempt'

export interface VerifyGate {
  /** This check's attempt row. */
  attemptId: string
  /** Other attempts in the window that count against this one. */
  failures: number
}

/**
 * Reserves this check: a `429` with `Retry-After` while the person is locked
 * (the reservation is withdrawn), else the gate the check closes.
 */
export async function openVerifyGate(
  c: Context<AppEnv>,
  provider: string,
): Promise<VerifyGate | Response> {
  const db = c.get('db')
  const [row] = auditRows(c, [{ event: ATTEMPT, facts: { name: provider } }])
  const viaKey = c.get('apiKey') !== null
  // Under the person, whichever way they checked; the type says which.
  const attempt = {
    ...row!,
    actorType: viaKey ? 'key' : 'user',
    actorId: c.get('userId'),
  } satisfies AuditEventInsert
  const since = new Date(Date.parse(attempt.createdAt) - VERIFY_FAILURE_WINDOW_MS).toISOString()
  const { failures, lastFailureAt } = await db.reserveAuditAttempt(
    attempt,
    since,
    viaKey ? undefined : 'user',
  )
  const locked = verifyLockout(
    failures,
    lastFailureAt ? new Date(lastFailureAt) : null,
    new Date(attempt.createdAt),
  )
  if (!locked) return { attemptId: attempt.id, failures }
  await db.deleteAuditEvent(attempt.id)
  c.header('Retry-After', String(locked.retryAfterSeconds))
  return c.json(
    {
      error: `Too many failed token checks. Try again in ${formatWait(locked.retryAfterSeconds)}.`,
    },
    429,
  )
}

/** A check that never got an answer (the provider call threw) counts as none. */
export async function abandonVerifyGate(c: Context<AppEnv>, gate: VerifyGate): Promise<void> {
  await c.get('db').deleteAuditEvent(gate.attemptId)
}

/** Records the outcome: a valid token withdraws its attempt; a failure that starts a wait says so. */
export async function closeVerifyGate(
  c: Context<AppEnv>,
  gate: VerifyGate,
  provider: string,
  valid: boolean,
): Promise<void> {
  if (valid) {
    await c.get('db').deleteAuditEvent(gate.attemptId)
    return
  }
  const failures = gate.failures + 1
  const lockedForSeconds = verifyLockSeconds(failures)
  await recordAudit(
    c,
    { event: 'connection.verify.failed', facts: { name: provider } },
    ...(lockedForSeconds > 0
      ? [
          {
            event: 'connection.verify.locked' as const,
            facts: { name: provider, failures, lockedForSeconds },
          },
        ]
      : []),
  )
}
