import type { DatabaseAdapter } from '@awaitstep/db'
import { purgeExpiredAuditEvents } from './audit.js'
import { createLogger } from './logger.js'
import { notifyExpiringKeys, purgeExpiredNotifications } from './notify.js'

const log = createLogger('maintenance')

/**
 * The periodic jobs: the audit log's 90-day purge, the Inbox's 30-day purge,
 * and warnings for keys about to expire. One failing never stops the others.
 */
export async function runMaintenance(db: DatabaseAdapter, now = new Date()): Promise<void> {
  const jobs = {
    'audit purge': () => purgeExpiredAuditEvents(db, now),
    'notification purge': () => purgeExpiredNotifications(db, now),
    'key expiry check': () => notifyExpiringKeys(db, now),
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
