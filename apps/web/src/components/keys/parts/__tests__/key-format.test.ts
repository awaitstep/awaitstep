import { describe, expect, it } from 'vitest'
import { customExpiryError, expiryLabel, isExpired, lastUsedLabel } from '../key-format'

const now = new Date('2026-10-27T12:00:00.000Z')
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

describe('expiryLabel', () => {
  it('says Never for a key without an expiry', () => {
    expect(expiryLabel(null, now)).toEqual({ text: 'Never', soon: false })
  })

  it('counts days and flags the last week', () => {
    expect(expiryLabel(inDays(28), now)).toEqual({ text: 'In 28 days', soon: false })
    expect(expiryLabel(inDays(3), now)).toEqual({ text: 'In 3 days', soon: true })
    expect(expiryLabel(inDays(1), now)).toEqual({ text: 'Tomorrow', soon: true })
    expect(expiryLabel(inDays(-1), now)).toEqual({ text: 'Expired', soon: true })
  })

  it.each([
    [40 * 60_000, 'In 40 min'],
    [3_600_000, 'In 1 hour'],
    [2 * 3_600_000, 'In 2 hours'],
    [23.5 * 3_600_000, 'In 23 hours'],
  ])('counts a key that runs out within a day in minutes or hours (%i ms)', (ms, text) => {
    const at = new Date(now.getTime() + ms).toISOString()
    expect(expiryLabel(at, now)).toEqual({ text, soon: true })
    expect(isExpired(at, now)).toBe(false)
  })
})

describe('customExpiryError', () => {
  it.each([
    [null, 'Pick a date and time'],
    [new Date(now.getTime() - 60_000), 'Pick a time in the future'],
    [now, 'Pick a time in the future'],
    [new Date(now.getTime() + 60_000), undefined],
  ])('judges a picked expiry of %s', (at, error) => {
    expect(customExpiryError(at, now)).toBe(error)
  })
})

describe('lastUsedLabel', () => {
  it('reads Never for an unused key, else the short time', () => {
    expect(lastUsedLabel(null, now)).toBe('Never')
    expect(lastUsedLabel(new Date(now.getTime() - 22 * 60_000).toISOString(), now)).toBe('22m ago')
  })
})
