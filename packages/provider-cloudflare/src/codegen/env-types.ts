import type { BindingType } from './bindings.js'

/**
 * Cloudflare Worker `Env` interface field type for each detected binding kind.
 * `secret` and `variable` are intentionally `null` — they're emitted as
 * `string` fields alongside other string env vars, not as typed bindings.
 */
export const CF_ENV_TYPE: Record<BindingType, string | null> = {
  kv: 'KVNamespace',
  d1: 'D1Database',
  r2: 'R2Bucket',
  queue: 'Queue<unknown>',
  service: 'Fetcher',
  ai: 'Ai',
  vectorize: 'VectorizeIndex',
  analytics_engine: 'AnalyticsEngineDataset',
  hyperdrive: 'Hyperdrive',
  browser: 'Fetcher',
  secret: null,
  variable: null,
}
