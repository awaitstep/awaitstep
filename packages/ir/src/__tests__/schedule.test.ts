import { describe, expect, it, vi } from 'vitest'
import {
  isDue,
  nextAfter,
  nextTimes,
  parseCron,
  scheduleOf,
  scheduleProblemIn,
  timetableOf,
} from '../schedule/index.js'
import { isTimeZone } from '../schedule/zone.js'

const at = (iso: string) => Date.parse(iso)
const iso = (time: number | null) => (time === null ? null : new Date(time).toISOString())
const table = (cron: string, timezone = 'UTC') => timetableOf({ cron, timezone })
const next = (cron: string, from: string, timezone?: string) =>
  iso(nextAfter(table(cron, timezone), at(from)))
const times = (cron: string, from: string, count: number, timezone?: string) =>
  nextTimes(table(cron, timezone), at(from), count).map(iso)

describe('a cron expression, as Cloudflare reads it', () => {
  it('counts weekdays from 1 for Sunday, and takes names', () => {
    // 2026-11-22 is a Sunday.
    expect(next('0 9 * * 1', '2026-11-20T00:00:00Z')).toBe('2026-11-22T09:00:00.000Z')
    expect(next('0 9 * * sun', '2026-11-20T00:00:00Z')).toBe('2026-11-22T09:00:00.000Z')
    expect(next('0 9 * * 7', '2026-11-20T00:00:00Z')).toBe('2026-11-21T09:00:00.000Z')
    expect(times('10 7 * * mon-fri', '2026-11-20T08:00:00Z', 2)).toEqual([
      '2026-11-23T07:10:00.000Z',
      '2026-11-24T07:10:00.000Z',
    ])
    expect(times('10 7 * * 2-6', '2026-11-20T08:00:00Z', 2)).toEqual(
      times('10 7 * * mon-fri', '2026-11-20T08:00:00Z', 2),
    )
  })

  it('reads steps from the start of the field, not as an interval', () => {
    expect(times('*/45 * * * *', '2026-11-24T10:00:00Z', 3)).toEqual([
      '2026-11-24T10:45:00.000Z',
      '2026-11-24T11:00:00.000Z',
      '2026-11-24T11:45:00.000Z',
    ])
    expect([...parseCron('5/20 * * * *').minutes]).toEqual([5, 25, 45])
    expect([...parseCron('10-40/10,3 * * * *').minutes].sort((a, b) => a - b)).toEqual([
      3, 10, 20, 30, 40,
    ])
  })

  it('knows the last day, the last weekday and the nearest weekday of a month', () => {
    expect(next('0 0 L * *', '2026-02-01T00:00:00Z')).toBe('2026-02-28T00:00:00.000Z')
    expect(next('0 0 L FEB *', '2027-03-01T00:00:00Z')).toBe('2028-02-29T00:00:00.000Z')
    // February 2026 ends on a Saturday; May 2026 on a Sunday.
    expect(next('59 23 LW * *', '2026-02-01T00:00:00Z')).toBe('2026-02-27T23:59:00.000Z')
    expect(next('59 23 LW * *', '2026-05-01T00:00:00Z')).toBe('2026-05-29T23:59:00.000Z')
    // 15 August 2026 is a Saturday, 1 August too: it moves on, inside the month.
    expect(next('0 0 15W * *', '2026-08-01T12:00:00Z')).toBe('2026-08-14T00:00:00.000Z')
    expect(next('0 0 1W AUG *', '2026-07-01T00:00:00Z')).toBe('2026-08-03T00:00:00.000Z')
  })

  it('knows the last and the nth weekday of a month', () => {
    expect(next('0 18 * * 6L', '2026-11-01T00:00:00Z')).toBe('2026-11-27T18:00:00.000Z')
    expect(next('0 18 * * friL', '2026-11-01T00:00:00Z')).toBe('2026-11-27T18:00:00.000Z')
    expect(next('0 9 * * MON#3', '2026-11-01T00:00:00Z')).toBe('2026-11-16T09:00:00.000Z')
    expect(next('0 9 * * 2#5', '2026-11-01T00:00:00Z')).toBe('2026-11-30T09:00:00.000Z')
  })

  it('fires on either day field when both are set', () => {
    // Friday the 13th, or any 13th, or any Friday.
    expect(times('0 0 13 * FRI', '2026-11-12T00:00:00Z', 3)).toEqual([
      '2026-11-13T00:00:00.000Z',
      '2026-11-20T00:00:00.000Z',
      '2026-11-27T00:00:00.000Z',
    ])
  })

  it.each([
    ['* * * *', 'five fields'],
    ['* * * * * *', 'five fields'],
    ['', 'five fields'],
    ['60 * * * *', 'minute 60 is outside 0–59'],
    ['* 24 * * *', 'hour 24 is outside 0–23'],
    ['* * 0 * *', 'day of month 0 is outside 1–31'],
    ['* * * 13 *', 'month 13 is outside 1–12'],
    ['* * * * 0', '1 is Sunday'],
    ['* * * * 8', 'weekday 8 is outside 1–7'],
    ['*/0 * * * *', 'a step of 1 or more'],
    ['5-1 * * * *', 'runs backwards'],
    ['1,,2 * * * *', 'empty entry'],
    ['a * * * *', '"a" is not a minute'],
    ['* * * * MON#6', 'outside 1–5'],
    ['* * * JANUARY *', 'not a month'],
  ])('refuses %j and says why', (cron, reason) => {
    expect(() => parseCron(cron)).toThrow(reason)
  })
})

describe('a schedule in a timezone', () => {
  it('follows the zone’s clock through the year', () => {
    const daily = '0 8 * * *'
    expect(next(daily, '2026-01-10T00:00:00Z', 'Europe/Amsterdam')).toBe('2026-01-10T07:00:00.000Z')
    expect(next(daily, '2026-07-10T00:00:00Z', 'Europe/Amsterdam')).toBe('2026-07-10T06:00:00.000Z')
    expect(next('30 9 * * *', '2026-01-10T00:00:00Z', 'Asia/Kolkata')).toBe(
      '2026-01-10T04:00:00.000Z',
    )
    // The weekday is the zone’s: Monday 00:30 in Auckland is still Sunday in UTC.
    expect(next('30 0 * * MON', '2026-11-20T00:00:00Z', 'Pacific/Auckland')).toBe(
      '2026-11-22T11:30:00.000Z',
    )
  })

  it('fires a time the clock jumps over once, in the first minute after the jump', () => {
    // Europe/Amsterdam, 29 March 2026: 02:00 becomes 03:00 at 01:00 UTC.
    expect(times('30 2 * * *', '2026-03-28T00:00:00Z', 3, 'Europe/Amsterdam')).toEqual([
      '2026-03-28T01:30:00.000Z',
      '2026-03-29T01:00:00.000Z',
      '2026-03-30T00:30:00.000Z',
    ])
    // Every quarter of the missing hour fires together, once.
    const jump = table('*/15 2 * * *', 'Europe/Amsterdam')
    expect(isDue(jump, at('2026-03-29T01:00:00Z'))).toBe(true)
    expect(isDue(jump, at('2026-03-29T01:01:00Z'))).toBe(false)
    expect(isDue(jump, at('2026-03-29T01:15:00Z'))).toBe(false)
    // A time that does exist that day is not moved.
    expect(next('30 3 * * *', '2026-03-29T00:00:00Z', 'Europe/Amsterdam')).toBe(
      '2026-03-29T01:30:00.000Z',
    )
  })

  it('fires a time that comes round twice the first time only', () => {
    // Europe/Amsterdam, 25 October 2026: 03:00 becomes 02:00 at 01:00 UTC.
    expect(times('30 2 * * *', '2026-10-24T12:00:00Z', 2, 'Europe/Amsterdam')).toEqual([
      '2026-10-25T00:30:00.000Z',
      '2026-10-26T01:30:00.000Z',
    ])
    expect(isDue(table('30 2 * * *', 'Europe/Amsterdam'), at('2026-10-25T01:30:00Z'))).toBe(false)
    // Hourly keeps to the clock: 02:00 once, then 03:00.
    expect(times('0 * * * *', '2026-10-24T23:30:00Z', 3, 'Europe/Amsterdam')).toEqual([
      '2026-10-25T00:00:00.000Z',
      '2026-10-25T02:00:00.000Z',
      '2026-10-25T03:00:00.000Z',
    ])
  })

  it('handles a zone that moves by half an hour', () => {
    // Australia/Lord_Howe, 5 April 2026: 02:00 becomes 01:30 at 15:00 UTC on the 4th.
    expect(times('45 1 * * *', '2026-04-04T00:00:00Z', 2, 'Australia/Lord_Howe')).toEqual([
      '2026-04-04T14:45:00.000Z',
      '2026-04-05T15:15:00.000Z',
    ])
  })

  it('agrees with itself: a time is due exactly when it is a next time', () => {
    const schedule = table('*/20 1-3 * * *', 'Europe/Amsterdam')
    const from = at('2026-03-28T22:00:00Z')
    const due: string[] = []
    for (let minute = 1; minute <= 8 * 60; minute++) {
      if (isDue(schedule, from + minute * 60_000)) due.push(iso(from + minute * 60_000)!)
    }
    expect(nextTimes(schedule, from, due.length).map(iso)).toEqual(due)
    // 01:00, 01:20, 01:40, then the missing hour once at 03:00, then 03:20 and 03:40.
    expect(due).toEqual([
      '2026-03-29T00:00:00.000Z',
      '2026-03-29T00:20:00.000Z',
      '2026-03-29T00:40:00.000Z',
      '2026-03-29T01:00:00.000Z',
      '2026-03-29T01:20:00.000Z',
      '2026-03-29T01:40:00.000Z',
    ])
  })

  it('finds a rare time, and says when there is none', () => {
    expect(next('0 0 29 2 *', '2026-11-24T00:00:00Z', 'America/New_York')).toBe(
      '2028-02-29T05:00:00.000Z',
    )
    expect(next('0 0 31 2 *', '2026-11-24T00:00:00Z')).toBeNull()
  })
})

describe('a schedule entry', () => {
  it('is a cron alone, in UTC, or carries its timezone and params', () => {
    expect(scheduleOf(' 0 8 * * * ')).toEqual({ cron: '0 8 * * *', timezone: 'UTC' })
    expect(
      scheduleOf({ cron: '0 8 * * *', timezone: 'Europe/Amsterdam', params: { a: 1 } }),
    ).toEqual({ cron: '0 8 * * *', timezone: 'Europe/Amsterdam', params: { a: 1 } })
  })

  it('says what is wrong with one that cannot be deployed', () => {
    const now = at('2026-11-24T00:00:00Z')
    expect(scheduleProblemIn('0 8 * * *', now)).toBeNull()
    expect(scheduleProblemIn({ cron: '0 8 * * *', timezone: 'Europe/Amsterdam' }, now)).toBeNull()
    expect(scheduleProblemIn('0 8 * *', now)).toContain('five fields')
    expect(scheduleProblemIn({ cron: '0 8 * * *', timezone: 'Mars/Olympus' }, now)).toBe(
      '"Mars/Olympus" is not a timezone',
    )
    expect(scheduleProblemIn('0 0 31 2 *', now)).toBe('"0 0 31 2 *" never comes round')
    expect(
      scheduleProblemIn({ cron: '* * * * *', params: { big: 'x'.repeat(100_001) } }, now),
    ).toBe('The params of "* * * * *" are over 100 KB')
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(scheduleProblemIn({ cron: '* * * * *', params: loop }, now)).toContain('are not JSON')
  })
})

describe('looking for a schedule’s next time', () => {
  const asked = (cron: string, timeZone: string) => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
    try {
      const next = nextAfter(timetableOf({ cron, timezone: timeZone }), Date.UTC(2026, 10, 20))
      return { next, calls: spy.mock.calls.length }
    } finally {
      spy.mockRestore()
    }
  }

  it('passes over the days a rare schedule cannot fire on without asking its zone', () => {
    // 29 February in New York: 00:00 there is 05:00 UTC.
    const leap = asked('0 0 29 2 *', 'America/New_York')
    expect(leap.next).toBe(Date.UTC(2028, 1, 29, 5, 0))
    expect(leap.calls).toBeLessThan(1000)
    // A date that never comes: five years are looked through, and only the rest
    // of the first day asks the zone.
    const never = asked('0 0 31 2 *', 'America/New_York')
    expect(never.next).toBeNull()
    expect(never.calls).toBeLessThan(1000)
  })

  it('still finds a time that falls on the zone’s date either side of UTC’s', () => {
    // 23:30 on the 1st in Honolulu (UTC-10) is 09:30 UTC on the 2nd.
    expect(asked('30 23 1 12 *', 'Pacific/Honolulu').next).toBe(Date.UTC(2026, 11, 2, 9, 30))
    // 00:30 on the 1st in Kiritimati (UTC+14) is 10:30 UTC on 30 November.
    expect(asked('30 0 1 12 *', 'Pacific/Kiritimati').next).toBe(Date.UTC(2026, 10, 30, 10, 30))
  })

  it('takes any number of spellings of a zone', () => {
    for (let i = 0; i < 300; i++) {
      const spelling = 'Europe/Amsterdam'
        .split('')
        .map((letter, at) => ((i >> (at % 8)) & 1 ? letter.toUpperCase() : letter.toLowerCase()))
        .join('')
      expect(isTimeZone(spelling)).toBe(true)
    }
    expect(asked('0 8 * * *', 'Europe/Amsterdam').next).toBe(Date.UTC(2026, 10, 20, 7, 0))
  })
})
