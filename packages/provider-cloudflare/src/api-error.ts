/** A Cloudflare API call Cloudflare refused: its HTTP status and first error. */
export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Cloudflare's error code, when it gave one. */
    readonly code?: number,
  ) {
    super(message)
    this.name = 'CloudflareApiError'
  }
}

const GONE = /\.(workflow|instance)\.not_found$/

/**
 * What a refusal says is gone: the Workflow or the instance, by Cloudflare's
 * own `…workflow.not_found` / `…instance.not_found`. Null for anything else —
 * another 404 (a wrong account id, a route) is not proof the run is gone.
 */
export function goneFrom(err: unknown): 'workflow' | 'instance' | null {
  if (!(err instanceof CloudflareApiError) || err.status !== 404) return null
  const match = GONE.exec(err.message)
  return match ? (match[1] as 'workflow' | 'instance') : null
}
