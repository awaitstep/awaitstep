import type { Context, MiddlewareHandler } from 'hono'
import type { OssFeature } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'

/** What a request to a switched-off feature is told. Only features with routes of their own have one. */
const SWITCHED_OFF_REASONS = {
  'connections.apiTokens':
    'This instance connects Cloudflare accounts through OAuth only. Pasted API tokens aren’t accepted.',
} as const satisfies Partial<Record<OssFeature, string>>

type GatedFeature = keyof typeof SWITCHED_OFF_REASONS

/**
 * Whether this instance switches `feature` off. A route reached without the
 * app's context middleware throws rather than reading as "on": a gate must
 * never fail open.
 */
export function featureOff(c: Context<AppEnv>, feature: OssFeature): boolean {
  const disabled = c.get('disabledFeatures')
  if (!disabled) throw new Error('disabledFeatures is not set: the route runs outside createApp')
  return disabled.has(feature)
}

/** The refusal of a request that needs a switched-off feature: 403 with the reason. */
export function switchedOff(c: Context<AppEnv>, feature: GatedFeature): Response {
  return c.json({ error: SWITCHED_OFF_REASONS[feature] }, 403)
}

/** Refuses the route, before its body is read, when the instance switches `feature` off. */
export function requireFeature(feature: GatedFeature): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (featureOff(c, feature)) return switchedOff(c, feature)
    await next()
  }
}
