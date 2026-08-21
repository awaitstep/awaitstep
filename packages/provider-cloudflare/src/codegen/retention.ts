/**
 * Instance retention settings passed to `WORKFLOW.create()` and the REST
 * instance-create endpoint. Durations are milliseconds or Cloudflare duration
 * strings like "7 days". Cloudflare caps retention at the account plan's
 * maximum (3 days on Workers Free, 30 days on Workers Paid).
 */
export interface CloudflareRetention {
  successRetention?: string | number
  errorRetention?: string | number
}

/**
 * Applied whenever a deployment config does not set retention explicitly.
 * Retained instance state bills at $0.20/GB-month past the included 1 GB, so
 * AwaitStep defaults to 7 days instead of the account maximum.
 */
export const DEFAULT_RETENTION: CloudflareRetention = {
  successRetention: '7 days',
  errorRetention: '7 days',
}

/**
 * Normalizes a deployment config's retention: an unset or empty object falls
 * back to {@link DEFAULT_RETENTION}; a partially set one is kept as-is (the
 * unset field gets Cloudflare's account-maximum default).
 */
export function resolveRetention(retention?: CloudflareRetention): CloudflareRetention {
  if (!retention) return DEFAULT_RETENTION
  if (retention.successRetention === undefined && retention.errorRetention === undefined) {
    return DEFAULT_RETENTION
  }
  return retention
}

/**
 * Renders the `AWAITSTEP_RETENTION` object literal emitted into generated
 * workers. Falls back to {@link DEFAULT_RETENTION} and omits unset fields so
 * Cloudflare's own default (account maximum) applies per field.
 */
export function retentionLiteral(retention?: CloudflareRetention): string {
  const source = resolveRetention(retention)
  const fields: string[] = []
  if (source.successRetention !== undefined) {
    fields.push(`successRetention: ${JSON.stringify(source.successRetention)}`)
  }
  if (source.errorRetention !== undefined) {
    fields.push(`errorRetention: ${JSON.stringify(source.errorRetention)}`)
  }
  return `{ ${fields.join(', ')} }`
}
