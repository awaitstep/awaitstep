import { describe, expect, it } from 'vitest'
import { expiryLabel, isExpired, lastUsedLabel } from '../key-format'

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

  it('says Today for a key that runs out later today, not Tomorrow', () => {
    const inTwoHours = new Date(now.getTime() + 2 * 3_600_000).toISOString()
    expect(expiryLabel(inTwoHours, now)).toEqual({ text: 'Today', soon: true })
    expect(isExpired(inTwoHours, now)).toBe(false)
  })
})

describe('lastUsedLabel', () => {
  it('reads Never for an unused key, else the short time', () => {
    expect(lastUsedLabel(null, now)).toBe('Never')
    expect(lastUsedLabel(new Date(now.getTime() - 22 * 60_000).toISOString(), now)).toBe('22m ago')
  })
})
