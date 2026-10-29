import { rateLimiter } from 'hono-rate-limiter'
import type { Context } from 'hono'
import type { AppEnv } from '../types.js'
import { rateLimitKey } from '../lib/client-ip.js'

/**
 * Per-instance, in-memory counters: they reset on restart and are not shared
 * between processes. That holds on the single-process Node deployment; on
 * Workers every isolate counts on its own, so these limits are loose there
 * and Cloudflare's own rate-limiting rules are the real brake (the Workers
 * install guide says so). Keyed by the address app.ts resolves — IPv6 by /64.
 */
export function createRateLimiter(config: {
  windowMs: number
  max: number
  keyGenerator?: (c: Context<AppEnv>) => string
}) {
  return rateLimiter<AppEnv>({
    windowMs: config.windowMs,
    limit: config.max,
    keyGenerator: config.keyGenerator ?? ((c) => rateLimitKey(c.get('clientIp'))),
  })
}

/**
 * A per-key budget spent in units rather than requests — emails, where one
 * request may send many. In memory per instance, like the limiters above.
 */
export function createBudget(config: { windowMs: number; max: number }) {
  const buckets = new Map<string, { used: number; resetAt: number }>()
  return {
    /** Spends `cost` from the key's window; false (and nothing spent) when it would exceed the budget. */
    take(key: string, cost: number, now = Date.now()): boolean {
      if (buckets.size > 10_000) {
        for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
      }
      let bucket = buckets.get(key)
      if (!bucket || bucket.resetAt <= now) {
        bucket = { used: 0, resetAt: now + config.windowMs }
        buckets.set(key, bucket)
      }
      if (bucket.used + cost > config.max) return false
      bucket.used += cost
      return true
    },
  }
}

export type Budget = ReturnType<typeof createBudget>
