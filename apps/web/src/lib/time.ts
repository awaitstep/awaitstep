import { formatDistanceToNowStrict, formatDistanceStrict, format, isPast } from 'date-fns'

export function timeAgo(dateStr: string | Date): string {
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) return 'just now'
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

export function timeUntil(dateStr: string | Date): string {
  const date = new Date(dateStr)
  if (isPast(date)) return 'expired'
  return formatDistanceToNowStrict(date)
}

export function duration(start: string, end: string, status?: string): string {
  if (status && ['running', 'queued'].includes(status)) return '--'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  return formatDistanceStrict(new Date(start), new Date(end))
}

/** Compact exact duration, e.g. "850ms", "42s", "3m 12s", "2h 5m". */
export function durationCompact(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function formatDate(dateStr: string | Date): string {
  return format(new Date(dateStr), 'MMM d, yyyy h:mm a')
}

/** Like formatDate but with second precision, for run timelines. */
export function formatDateTime(dateStr: string | Date): string {
  return format(new Date(dateStr), 'MMM d, yyyy h:mm:ss a')
}

export function formatShortDate(dateStr: string | Date): string {
  return format(new Date(dateStr), 'MMM d, h:mm a')
}

export function formatMonthYear(dateStr: string | Date): string {
  return format(new Date(dateStr), 'MMMM yyyy')
}
