import type { DatabaseAdapter } from '@awaitstep/db'
import { purgeExpiredAuditEvents } from './audit.js'
import { createLogger } from './logger.js'
import { recheckConnectionTokens } from './connection-token.js'
import {
  notifyExpiringConnections,
  notifyExpiringKeys,
  purgeExpiredNotifications,
} from './notify.js'

const log = createLogger('maintenance')

/**
 * The periodic jobs: the audit log's 90-day purge, the Inbox's 30-day purge,
 * warnings for keys about to expire, and the Cloudflare tokens: a daily
 * re-check, then warnings for those about to expire (after the re-check, so
 * a fresh expiry warns in the same tick). One failing never stops the others.
 */
export async function runMaintenance(db: DatabaseAdapter, now = new Date()): Promise<void> {
  const jobs = {
    'audit purge': () => purgeExpiredAuditEvents(db, now),
    'notification purge': () => purgeExpiredNotifications(db, now),
    'key expiry check': () => notifyExpiringKeys(db, now),
    // The expiry warnings run after the re-check (a fresh expiry warns in the
    // same tick) but never depend on it: a failed re-check still warns.
    'token checks': async () => {
      await recheckConnectionTokens(db, now).catch((err: unknown) => {
        log.error('token re-check failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
      return notifyExpiringConnections(db, now)
    },
  }
  const results = await Promise.allSettled(Object.values(jobs).map((job) => job()))
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      log.error(`${Object.keys(jobs)[i]} failed`, {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  })
}

/** Hourly, and once at start, for long-lived Node processes (the Worker's cron runs it there). */
export function startMaintenanceLoop(db: DatabaseAdapter, intervalMs = 60 * 60 * 1000): () => void {
  const tick = () => void runMaintenance(db)
  tick()
  const timer = setInterval(tick, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
  return () => clearInterval(timer)
}
