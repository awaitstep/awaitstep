import { describe, expect, it } from 'vitest'
import { tooManyRequests } from '../middleware/rate-limit.js'

describe('tooManyRequests', () => {
  it('names the window the limiter counts', () => {
    expect(tooManyRequests(60_000)).toBe('Too many requests. Try again within a minute.')
    expect(tooManyRequests(15 * 60_000)).toBe('Too many requests. Try again within 15 minutes.')
    expect(tooManyRequests(60 * 60_000)).toBe('Too many requests. Try again within an hour.')
    expect(tooManyRequests(24 * 60 * 60_000)).toBe('Too many requests. Try again within 24 hours.')
  })
})
