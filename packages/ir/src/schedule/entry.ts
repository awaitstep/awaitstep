import { CronError, parseCron } from './cron.js'
import { nextAfter, type Timetable } from './due.js'
import { isTimeZone } from './zone.js'

/**
 * One schedule in a workflow's deploy settings: a cron expression alone
 * (read in UTC), or with the timezone it is read in and the params each run
 * it starts is given.
 */
export type ScheduleEntry = string | ScheduleDetails

export interface ScheduleDetails {
  cron: string
  /** An IANA name such as `Europe/Amsterdam`; UTC when absent. */
  timezone?: string
  /** The payload of each run the schedule starts, or the body of each call. */
  params?: unknown
}

/** An entry with nothing left to default. */
export interface Schedule {
  cron: string
  timezone: string
  params?: unknown
}

/** The most a schedule's params may weigh as JSON, the same as a run's body. */
export const SCHEDULE_PARAMS_MAX_BYTES = 100_000

export function scheduleOf(entry: ScheduleEntry): Schedule {
  if (typeof entry === 'string') return { cron: entry.trim(), timezone: 'UTC' }
  return {
    cron: entry.cron.trim(),
    timezone: entry.timezone?.trim() || 'UTC',
    ...(entry.params !== undefined && { params: entry.params }),
  }
}

/** The parsed form of a schedule already known to be valid. */
export function timetableOf(schedule: Pick<Schedule, 'cron' | 'timezone'>): Timetable {
  return { cron: parseCron(schedule.cron), timeZone: schedule.timezone }
}

/** Why an entry cannot be deployed, in words for the person who wrote it, or null. */
export function scheduleProblemIn(entry: ScheduleEntry, now: number = Date.now()): string | null {
  const schedule = scheduleOf(entry)
  let table: Timetable
  try {
    table = timetableOf(schedule)
  } catch (error) {
    if (error instanceof CronError) return `"${schedule.cron}": ${error.message}`
    throw error
  }
  if (!isTimeZone(schedule.timezone)) return `"${schedule.timezone}" is not a timezone`
  if (schedule.params !== undefined) {
    let json: string | undefined
    try {
      json = JSON.stringify(schedule.params)
    } catch {
      json = undefined
    }
    if (json === undefined) return `The params of "${schedule.cron}" are not JSON`
    if (new TextEncoder().encode(json).byteLength > SCHEDULE_PARAMS_MAX_BYTES) {
      return `The params of "${schedule.cron}" are over 100 KB`
    }
  }
  if (nextAfter(table, now) === null) return `"${schedule.cron}" never comes round`
  return null
}

/** Two entries that would fire the same schedule twice. */
export function sameSchedule(a: Schedule, b: Schedule): boolean {
  return a.cron === b.cron && a.timezone === b.timezone
}
