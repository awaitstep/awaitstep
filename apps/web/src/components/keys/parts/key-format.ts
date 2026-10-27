import { differenceInCalendarDays } from 'date-fns'
import { timeAgoOrDay } from '../../../lib/time'

/** A key this close to expiring shows its expiry in amber. */
const SOON_DAYS = 7

/** Whether a key has stopped working. */
export function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  return expiresAt !== null && new Date(expiresAt) <= now
}

/** "Never", "Today", "Tomorrow", "In 28 days" (calendar days), "Expired", and whether it's soon. */
export function expiryLabel(
  expiresAt: string | null,
  now: Date = new Date(),
): { text: string; soon: boolean } {
  if (!expiresAt) return { text: 'Never', soon: false }
  if (isExpired(expiresAt, now)) return { text: 'Expired', soon: true }
  const days = differenceInCalendarDays(new Date(expiresAt), now)
  const text = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`
  return { text, soon: days <= SOON_DAYS }
}

/** "22m ago", "Yesterday", or "Never". */
export function lastUsedLabel(lastUsedAt: string | null, now: Date = new Date()): string {
  return lastUsedAt ? timeAgoOrDay(lastUsedAt, now) : 'Never'
}
