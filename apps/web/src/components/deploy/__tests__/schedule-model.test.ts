import { describe, expect, it } from 'vitest'
import { entryWith, paramsFromText, readSchedule, timeZones } from '../schedule-model'

const now = Date.parse('2026-11-24T10:30:00Z')

describe('entryWith', () => {
  it('keeps a schedule a bare cron while that says it all', () => {
    expect(entryWith('', { cron: '0 * * * *' })).toBe('0 * * * *')
    expect(entryWith('0 * * * *', { timezone: 'UTC' })).toBe('0 * * * *')
    expect(
      entryWith({ cron: '0 8 * * *', timezone: 'Europe/Amsterdam' }, { timezone: 'UTC' }),
    ).toBe('0 8 * * *')
  })

  it('carries the timezone and params once there are any', () => {
    const zoned = entryWith('0 8 * * *', { timezone: 'Europe/Amsterdam' })
    expect(zoned).toEqual({ cron: '0 8 * * *', timezone: 'Europe/Amsterdam' })
    const withParams = entryWith(zoned, { params: { shift: 'day' } })
    expect(withParams).toEqual({
      cron: '0 8 * * *',
      timezone: 'Europe/Amsterdam',
      params: { shift: 'day' },
    })
    expect(entryWith(withParams, { cron: '0 9 * * *' })).toEqual({
      cron: '0 9 * * *',
      timezone: 'Europe/Amsterdam',
      params: { shift: 'day' },
    })
    expect(entryWith(withParams, { params: undefined })).toEqual(zoned)
  })
})

describe('readSchedule', () => {
  it('says nothing about a row not filled in yet', () => {
    expect(readSchedule('', now)).toEqual({ state: 'blank' })
    expect(readSchedule({ cron: ' ', timezone: 'Europe/Amsterdam' }, now)).toEqual({
      state: 'blank',
    })
  })

  it('shows the next times on the schedule’s own clock', () => {
    expect(readSchedule({ cron: '0 8 * * *', timezone: 'Europe/Amsterdam' }, now, 2)).toEqual({
      state: 'ok',
      next: ['Wed 25 Nov, 08:00', 'Thu 26 Nov, 08:00'],
    })
    expect(readSchedule('0 */6 * * *', now, 2)).toEqual({
      state: 'ok',
      next: ['Tue 24 Nov, 12:00', 'Tue 24 Nov, 18:00'],
    })
  })

  it('says what is wrong', () => {
    expect(readSchedule('0 8 * * 0', now)).toMatchObject({ state: 'problem' })
    expect(readSchedule('every day', now)).toMatchObject({
      state: 'problem',
      problem: expect.stringContaining('five fields'),
    })
  })
})

describe('paramsFromText', () => {
  it('reads JSON, and blank as no params', () => {
    expect(paramsFromText('  ')).toEqual({ ok: true, params: undefined })
    expect(paramsFromText('{"a":1}')).toEqual({ ok: true, params: { a: 1 } })
    expect(paramsFromText('{"a":')).toEqual({ ok: false })
  })
})

describe('timeZones', () => {
  it('lists UTC first, once', () => {
    const zones = timeZones()
    expect(zones[0]).toBe('UTC')
    expect(zones.filter((zone) => zone === 'UTC')).toHaveLength(1)
    expect(zones).toContain('Europe/Amsterdam')
  })
})
