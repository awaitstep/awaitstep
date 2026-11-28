import { differenceInCalendarDays } from 'date-fns'
import { timeAgoOrDay } from '../../../lib/time'

/** A key this close to expiring shows its expiry in amber. */
const SOON_DAYS = 7
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** Whether a key has stopped working. */
export function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  return expiresAt !== null && new Date(expiresAt) <= now
}

/**
 * "Never", "In 40 min", "In 3 hours" (within a day), "Tomorrow", "In 28 days"
 * (calendar days), "Expired", and whether it's soon.
 */
export function expiryLabel(
  expiresAt: string | null,
  now: Date = new Date(),
): { text: string; soon: boolean } {
  if (!expiresAt) return { text: 'Never', soon: false }
  if (isExpired(expiresAt, now)) return { text: 'Expired', soon: true }
  const left = new Date(expiresAt).getTime() - now.getTime()
  if (left < HOUR_MS) return { text: `In ${Math.ceil(left / MINUTE_MS)} min`, soon: true }
  if (left < 24 * HOUR_MS) {
    const hours = Math.floor(left / HOUR_MS)
    return { text: hours === 1 ? 'In 1 hour' : `In ${hours} hours`, soon: true }
  }
  const days = differenceInCalendarDays(new Date(expiresAt), now)
  const text = days === 1 ? 'Tomorrow' : `In ${days} days`
  return { text, soon: days <= SOON_DAYS }
}

/** "22m ago", "Yesterday", or "Never". */
export function lastUsedLabel(lastUsedAt: string | null, now: Date = new Date()): string {
  return lastUsedAt ? timeAgoOrDay(lastUsedAt, now) : 'Never'
}

/** Why a picked expiry can't be used, or nothing when it can: it must be a date and time still ahead. */
export function customExpiryError(at: Date | null, now: Date = new Date()): string | undefined {
  if (!at) return 'Pick a date and time'
  return at > now ? undefined : 'Pick a time in the future'
}
