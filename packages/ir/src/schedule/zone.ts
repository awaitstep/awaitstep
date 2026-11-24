import type { ClockTime } from './cron.js'

// What a timezone's clock shows at a moment. `Intl` knows the zones and
// their daylight-saving rules on every runtime the app and its generated
// Workers run on.

const formats = new Map<string, Intl.DateTimeFormat>()
/** A formatter is kept per spelling of a zone, and spellings are without end: the cache is emptied at this many. */
const MAX_FORMATS = 64

function formatFor(timeZone: string): Intl.DateTimeFormat {
  let format = formats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    if (formats.size >= MAX_FORMATS) formats.clear()
    formats.set(timeZone, format)
  }
  return format
}

/** Whether `Intl` knows the zone by that name. */
export function isTimeZone(timeZone: string): boolean {
  if (timeZone === 'UTC') return true
  try {
    formatFor(timeZone)
    return true
  } catch {
    return false
  }
}

/** A minute, in milliseconds. */
export const MINUTE_MS = 60_000

/** A clock time as minutes on a line with no zone, for telling two clock times apart. */
export function clockMinutes(at: ClockTime): number {
  return Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute) / MINUTE_MS
}

/** The clock time that many minutes along that line. */
export function clockAt(minutes: number): ClockTime {
  const date = new Date(minutes * MINUTE_MS)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  }
}

/** What the zone's clock shows at `time` (epoch milliseconds). */
export function clockIn(timeZone: string, time: number): ClockTime {
  if (timeZone === 'UTC') return clockAt(Math.floor(time / MINUTE_MS))
  const at: Record<string, number> = {}
  for (const part of formatFor(timeZone).formatToParts(time)) {
    if (part.type !== 'literal') at[part.type] = Number(part.value)
  }
  return {
    year: at.year!,
    month: at.month!,
    day: at.day!,
    hour: at.hour!,
    minute: at.minute!,
  }
}

/** How far the zone's clock is ahead of UTC at `time`, in minutes. */
export function offsetIn(timeZone: string, time: number): number {
  if (timeZone === 'UTC') return 0
  return clockMinutes(clockIn(timeZone, time)) - Math.floor(time / MINUTE_MS)
}
