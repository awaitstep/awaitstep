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
