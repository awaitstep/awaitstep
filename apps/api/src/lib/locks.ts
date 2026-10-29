import { z } from 'zod'
import type { LockRow } from '@awaitstep/db'
import { lockRecord, type LockRecord } from './scope-records.js'

/** `PUT /projects/:id/lock` and `PUT /workspaces/:id/lock`: the switch's new state. */
export const lockBodySchema = z.object({ locked: z.boolean() })

/**
 * A guarded write refused, and the read after it found nothing in the way:
 * a lock or a sibling changed between the two.
 */
export const CHANGED_MEANWHILE = 'Something changed meanwhile. Reload and try again'

export function lockResponse(row: LockRow): { lock: LockRecord | null } {
  return { lock: lockRecord(row.lockedBy, row.lockedAt, row.lockedByName) }
}
