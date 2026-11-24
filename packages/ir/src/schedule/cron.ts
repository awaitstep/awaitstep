// Cron expressions as Cloudflare's Cron Triggers read them, so a schedule
// means the same wherever a workflow is deployed: five fields, weekdays 1–7
// with 1 = Sunday (or names), month names, `L` and `W` in the day of month,
// `L` and `#` in the weekday.

/** A parsed expression. Weekdays are 0 (Sunday) to 6, as `Date` numbers them. */
export interface CronExpression {
  minutes: ReadonlySet<number>
  hours: ReadonlySet<number>
  months: ReadonlySet<number>
  /** Unrestricted (`*`): the other day field alone decides. */
  anyDayOfMonth: boolean
  anyWeekday: boolean
  days: ReadonlySet<number>
  lastDay: boolean
  lastWeekdayOfMonth: boolean
  /** `15W`: the weekday nearest to that day, within the month. */
  nearestWeekdayTo: readonly number[]
  weekdays: ReadonlySet<number>
  /** `6L`: the last such weekday of the month. */
  lastWeekdays: ReadonlySet<number>
  /** `2#3`: the third Monday. */
  nthWeekdays: ReadonlyArray<{ weekday: number; nth: number }>
}

export class CronError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CronError'
  }
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

interface Field {
  label: string
  min: number
  max: number
  names?: readonly string[]
}

const MINUTE_FIELD: Field = { label: 'minute', min: 0, max: 59 }
const HOUR_FIELD: Field = { label: 'hour', min: 0, max: 23 }
const DAY_FIELD: Field = { label: 'day of month', min: 1, max: 31 }
const MONTH_FIELD: Field = { label: 'month', min: 1, max: 12, names: MONTHS }
const WEEKDAY_FIELD: Field = { label: 'weekday', min: 1, max: 7, names: WEEKDAYS }

function numberIn(field: Field, text: string): number {
  const named = field.names?.indexOf(text.toUpperCase()) ?? -1
  if (named !== -1) return field.min + named
  if (!/^\d{1,2}$/.test(text)) throw new CronError(`"${text}" is not a ${field.label}`)
  const value = Number(text)
  if (value < field.min || value > field.max) {
    const hint =
      field === WEEKDAY_FIELD ? ' (1 is Sunday, 7 is Saturday; names such as MON are clearer)' : ''
    throw new CronError(`${field.label} ${value} is outside ${field.min}–${field.max}${hint}`)
  }
  return value
}

// A part of a field: all of it, one value, a range, or any of those with a step.
// "5/20" counts on from 5 to the end of the field.
function valuesOf(field: Field, part: string): number[] {
  const [range = '', stepText, ...rest] = part.split('/')
  if (rest.length > 0) throw new CronError(`"${part}" has more than one step`)
  let step = 1
  if (stepText !== undefined) {
    if (!/^\d{1,2}$/.test(stepText) || Number(stepText) === 0) {
      throw new CronError(`"${part}" needs a step of 1 or more`)
    }
    step = Number(stepText)
  }
  let from: number
  let to: number
  if (range === '*') {
    from = field.min
    to = field.max
  } else if (range.includes('-')) {
    const [low = '', high = '', ...more] = range.split('-')
    if (more.length > 0) throw new CronError(`"${range}" is not a range`)
    from = numberIn(field, low)
    to = numberIn(field, high)
    if (from > to) throw new CronError(`The range "${range}" runs backwards`)
  } else {
    from = numberIn(field, range)
    to = stepText === undefined ? from : field.max
  }
  const values: number[] = []
  for (let value = from; value <= to; value += step) values.push(value)
  return values
}

function plainField(field: Field, text: string): Set<number> {
  const values = new Set<number>()
  for (const part of text.split(',')) {
    if (part === '') throw new CronError(`The ${field.label} field has an empty entry`)
    for (const value of valuesOf(field, part)) values.add(value)
  }
  return values
}

/** Parses a five-field expression, or throws a {@link CronError} that says what is wrong. */
export function parseCron(text: string): CronExpression {
  const fields = text.trim().split(/\s+/)
  if (fields.length !== 5 || fields[0] === '') {
    throw new CronError('A schedule has five fields: minute, hour, day of month, month and weekday')
  }
  const [minute, hour, day, month, weekday] = fields as [string, string, string, string, string]

  const days = new Set<number>()
  const nearestWeekdayTo: number[] = []
  let lastDay = false
  let lastWeekdayOfMonth = false
  for (const part of day.split(',')) {
    const upper = part.toUpperCase()
    if (upper === 'L') lastDay = true
    else if (upper === 'LW') lastWeekdayOfMonth = true
    else if (/^\d{1,2}W$/.test(upper))
      nearestWeekdayTo.push(numberIn(DAY_FIELD, upper.slice(0, -1)))
    else for (const value of plainField(DAY_FIELD, part)) days.add(value)
  }

  const weekdays = new Set<number>()
  const lastWeekdays = new Set<number>()
  const nthWeekdays: Array<{ weekday: number; nth: number }> = []
  for (const part of weekday.split(',')) {
    const upper = part.toUpperCase()
    const last = /^(\w{1,3})L$/.exec(upper)
    const nth = /^(\w{1,3})#(\d)$/.exec(upper)
    if (last) lastWeekdays.add(numberIn(WEEKDAY_FIELD, last[1]!) - 1)
    else if (nth) {
      const which = Number(nth[2])
      if (which < 1 || which > 5) throw new CronError(`"${part}" names a week outside 1–5`)
      nthWeekdays.push({ weekday: numberIn(WEEKDAY_FIELD, nth[1]!) - 1, nth: which })
    } else for (const value of plainField(WEEKDAY_FIELD, part)) weekdays.add(value - 1)
  }

  return {
    minutes: plainField(MINUTE_FIELD, minute),
    hours: plainField(HOUR_FIELD, hour),
    months: plainField(MONTH_FIELD, month),
    anyDayOfMonth: day === '*',
    anyWeekday: weekday === '*',
    days,
    lastDay,
    lastWeekdayOfMonth,
    nearestWeekdayTo,
    weekdays,
    lastWeekdays,
    nthWeekdays,
  }
}

/** A moment on some clock: its date and time as that clock shows them. */
export interface ClockTime {
  year: number
  /** 1–12 */
  month: number
  day: number
  hour: number
  minute: number
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()
const weekdayOf = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).getUTCDay()
const isWorkday = (weekday: number) => weekday !== 0 && weekday !== 6

function nearestWorkday(year: number, month: number, day: number): number {
  const target = Math.min(day, daysIn(year, month))
  const weekday = weekdayOf(year, month, target)
  if (isWorkday(weekday)) return target
  // Saturday falls back to Friday and Sunday on to Monday, without leaving the month.
  if (weekday === 6) return target > 1 ? target - 1 : target + 2
  return target < daysIn(year, month) ? target + 1 : target - 2
}

function lastWorkday(year: number, month: number): number {
  let day = daysIn(year, month)
  while (!isWorkday(weekdayOf(year, month, day))) day--
  return day
}

/** Whether the expression names that date. With both day fields set, either is enough. */
export function matchesDate(cron: CronExpression, at: Pick<ClockTime, 'year' | 'month' | 'day'>) {
  if (!cron.months.has(at.month)) return false
  if (cron.anyDayOfMonth && cron.anyWeekday) return true
  const length = daysIn(at.year, at.month)
  const byDay = () =>
    cron.days.has(at.day) ||
    (cron.lastDay && at.day === length) ||
    (cron.lastWeekdayOfMonth && at.day === lastWorkday(at.year, at.month)) ||
    cron.nearestWeekdayTo.some((day) => nearestWorkday(at.year, at.month, day) === at.day)
  const byWeekday = () => {
    const weekday = weekdayOf(at.year, at.month, at.day)
    return (
      cron.weekdays.has(weekday) ||
      (cron.lastWeekdays.has(weekday) && at.day + 7 > length) ||
      cron.nthWeekdays.some((n) => n.weekday === weekday && Math.ceil(at.day / 7) === n.nth)
    )
  }
  if (cron.anyDayOfMonth) return byWeekday()
  if (cron.anyWeekday) return byDay()
  return byDay() || byWeekday()
}

/** Whether the expression names that minute on the clock it is read against. */
export function matchesClock(cron: CronExpression, at: ClockTime): boolean {
  return cron.minutes.has(at.minute) && cron.hours.has(at.hour) && matchesDate(cron, at)
}
