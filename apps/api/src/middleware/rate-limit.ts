import { rateLimiter } from 'hono-rate-limiter'
import type { Context } from 'hono'
import type { AppEnv } from '../types.js'
import { getClientIp } from '../lib/client-ip.js'

export function createRateLimiter(config: {
  windowMs: number
  max: number
  keyGenerator?: (c: Context<AppEnv>) => string
}) {
  return rateLimiter<AppEnv>({
    windowMs: config.windowMs,
    limit: config.max,
    keyGenerator: config.keyGenerator ?? ((c) => getClientIp(c.req) ?? ''),
  })
}
