import { matchesClock, matchesDate, type CronExpression } from './cron.js'
import { MINUTE_MS, clockAt, clockIn, clockMinutes, offsetIn } from './zone.js'

// When a schedule fires. One rule for every place a workflow runs: the
// expression is read against its timezone's clock, and on the two days a
// year that clock changes it still fires once: a time the clock jumps over
// fires in the first minute after the jump, and a time that comes round
// twice fires the first time only.

/** A schedule ready to be asked about: its parsed expression and its timezone. */
export interface Timetable {
  cron: CronExpression
  timeZone: string
}

const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** No zone moves its clock by more than this at once. */
const LONGEST_CHANGE = 3 * HOUR_MS

/** Whether the schedule fires in the minute `time` (epoch milliseconds) falls in. */
export function isDue(table: Timetable, time: number): boolean {
  const minute = Math.floor(time / MINUTE_MS) * MINUTE_MS
  const { cron, timeZone } = table
  const now = clockIn(timeZone, minute)
  if (timeZone === 'UTC') return matchesClock(cron, now)

  const shown = clockMinutes(now)
  const offset = shown - minute / MINUTE_MS
  // The clock went back not long ago: has it shown this time before?
  const wentBack = offsetIn(timeZone, minute - LONGEST_CHANGE) - offset
  if (wentBack > 0 && clockMinutes(clockIn(timeZone, minute - wentBack * MINUTE_MS)) === shown) {
    return false
  }
  // The clock just jumped forward: the times it never showed fire now.
  const before = clockMinutes(clockIn(timeZone, minute - MINUTE_MS))
  for (let skipped = before + 1; skipped < shown; skipped++) {
    if (matchesClock(cron, clockAt(skipped))) return true
  }
  return matchesClock(cron, now)
}

/** True when the zone's clock keeps one offset from a little before `from` to `to`. */
function steady(timeZone: string, from: number, to: number): boolean {
  if (timeZone === 'UTC') return true
  const offset = offsetIn(timeZone, from)
  return offset === offsetIn(timeZone, to) && offset === offsetIn(timeZone, from - LONGEST_CHANGE)
}

/** Whether any minute from `from` up to `to` could fire, judged by date (and hour when asked). */
function mayFire(table: Timetable, from: number, to: number, byHour: boolean): boolean {
  if (!steady(table.timeZone, from, to)) return true
  const first = clockIn(table.timeZone, from)
  const last = clockIn(table.timeZone, to - MINUTE_MS)
  return [first, last].some(
    (at) => matchesDate(table.cron, at) && (!byHour || table.cron.hours.has(at.hour)),
  )
}

/**
 * Whether a day starting at `at` (a UTC midnight) could hold a date the
 * schedule names in any zone. A zone's date is never more than one day from
 * UTC's; a second day either way covers a clock that jumps over a date. Asks no zone anything, so a schedule for one day a year passes over
 * the rest of the year at no cost.
 */
function dateNear(cron: CronExpression, at: number): boolean {
  const day = at / MINUTE_MS
  return [-2, -1, 0, 1, 2].some((shift) => matchesDate(cron, clockAt(day + shift * 24 * 60)))
}

/** How far ahead a next time is looked for: a schedule for 29 February still has one. */
const HORIZON = 5 * 366 * DAY_MS

/**
 * The first time the schedule fires after `time` (epoch milliseconds, the
 * start of its minute), or null when it has none in the next five years.
 */
export function nextAfter(table: Timetable, time: number): number | null {
  let at = (Math.floor(time / MINUTE_MS) + 1) * MINUTE_MS
  const end = at + HORIZON
  while (at < end) {
    // Whole days, then whole hours, that cannot fire are stepped over.
    if (
      at % DAY_MS === 0 &&
      (!dateNear(table.cron, at) || !mayFire(table, at, at + DAY_MS, false))
    ) {
      at += DAY_MS
      continue
    }
    if (at % HOUR_MS === 0 && !mayFire(table, at, at + HOUR_MS, true)) {
      at += HOUR_MS
      continue
    }
    if (isDue(table, at)) return at
    at += MINUTE_MS
  }
  return null
}

/** The next `count` times the schedule fires after `time`. */
export function nextTimes(table: Timetable, time: number, count: number): number[] {
  const times: number[] = []
  let from = time
  while (times.length < count) {
    const next = nextAfter(table, from)
    if (next === null) break
    times.push(next)
    from = next
  }
  return times
}
