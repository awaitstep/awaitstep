import { afterEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { createRateLimiter, tooManyRequests } from '../middleware/rate-limit.js'
import type { AppEnv } from '../types.js'

describe('tooManyRequests', () => {
  it('names the window the limiter counts', () => {
    expect(tooManyRequests(60_000)).toBe('Too many requests. Try again within a minute.')
    expect(tooManyRequests(1000)).toBe('Too many requests. Try again within a second.')
    expect(tooManyRequests(30_000)).toBe('Too many requests. Try again within 30 seconds.')
    expect(tooManyRequests(15 * 60_000)).toBe('Too many requests. Try again within 15 minutes.')
    expect(tooManyRequests(60 * 60_000)).toBe('Too many requests. Try again within an hour.')
    expect(tooManyRequests(24 * 60 * 60_000)).toBe('Too many requests. Try again within 24 hours.')
  })
})

describe('createRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts no timer when it is created, so a Worker can create one in global scope', () => {
    vi.useFakeTimers()
    createRateLimiter({ windowMs: 60_000, max: 1 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still refuses the request past the limit once requests arrive', async () => {
    const app = new Hono<AppEnv>()
    app.use('*', createRateLimiter({ windowMs: 60_000, max: 1, keyGenerator: () => 'k' }))
    app.get('/', (c) => c.text('ok'))

    expect((await app.request('/')).status).toBe(200)
    const refused = await app.request('/')
    expect(refused.status).toBe(429)
    expect(await refused.json()).toEqual({ error: tooManyRequests(60_000) })
  })
})
