import {
  nextTimes,
  scheduleOf,
  scheduleProblemIn,
  timetableOf,
  type ScheduleEntry,
} from '@awaitstep/ir'

/** A schedule to start from. Weekdays are named, so no one has to know which number Monday is. */
export const SCHEDULE_PRESETS: { cron: string; label: string }[] = [
  { cron: '*/5 * * * *', label: 'Every 5 minutes' },
  { cron: '0 * * * *', label: 'Every hour' },
  { cron: '0 9 * * *', label: 'Every day at 09:00' },
  { cron: '0 9 * * MON-FRI', label: 'Weekdays at 09:00' },
  { cron: '0 9 * * MON', label: 'Mondays at 09:00' },
  { cron: '0 9 1 * *', label: 'The 1st of each month at 09:00' },
]

/** Every timezone the browser knows, UTC first. */
export function timeZones(): string[] {
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return ['UTC', ...known.filter((zone) => zone !== 'UTC')]
}

/** An entry with one part changed, kept as a bare cron while that says it all. */
export function entryWith(
  entry: ScheduleEntry,
  change: { cron?: string; timezone?: string; params?: unknown },
): ScheduleEntry {
  const current = typeof entry === 'string' ? { cron: entry } : entry
  const cron = change.cron ?? current.cron
  const timezone = 'timezone' in change ? change.timezone : current.timezone
  const params = 'params' in change ? change.params : current.params
  const zoned = timezone !== undefined && timezone !== 'UTC'
  if (!zoned && params === undefined) return cron
  return { cron, ...(zoned && { timezone }), ...(params !== undefined && { params }) }
}

export type ScheduleReading =
  { state: 'blank' } | { state: 'problem'; problem: string } | { state: 'ok'; next: string[] }

/** What a row says under its fields: what is wrong, or when it fires next, in its timezone. */
export function readSchedule(entry: ScheduleEntry, now: number, count = 3): ScheduleReading {
  const schedule = scheduleOf(entry)
  if (schedule.cron === '') return { state: 'blank' }
  const problem = scheduleProblemIn(entry, now)
  if (problem) return { state: 'problem', problem }
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: schedule.timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return {
    state: 'ok',
    next: nextTimes(timetableOf(schedule), now, count).map((time) => format.format(time)),
  }
}

/** A params field's text as the value it stands for; blank is no params. */
export function paramsFromText(text: string): { ok: true; params: unknown } | { ok: false } {
  if (text.trim() === '') return { ok: true, params: undefined }
  try {
    return { ok: true, params: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}
