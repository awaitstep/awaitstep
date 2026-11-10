import type { Connection, ConnectionRefresh, ConnectionTokenCheck } from '@awaitstep/db'
import { CloudflareOAuthError, refreshAccessToken } from '@awaitstep/provider-cloudflare'
import type { CloudflareOAuthRuntime } from './cloudflare-oauth-config.js'
import { createLogger } from './logger.js'

const log = createLogger('connection-refresh')

/** Renew a little before Cloudflare's expiry, so a request never starts on a dying token. */
const REFRESH_MARGIN_MS = 60_000
/** Cloudflare always sends `expires_in`; if it ever doesn't, assume the usual hour. */
const FALLBACK_TTL_SECONDS = 3600

interface StoredOAuthCredentials {
  authKind?: string
  accountId?: string
  apiToken?: string
  refreshToken?: string
  expiresAt?: string
  scopes?: string
}

function stored(json: string): StoredOAuthCredentials | null {
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as StoredOAuthCredentials) : null
  } catch {
    return null
  }
}

function expiryTime(credentials: StoredOAuthCredentials): number | null {
  if (!credentials.expiresAt) return null
  const time = Date.parse(credentials.expiresAt)
  return Number.isNaN(time) ? null : time
}

/**
 * The refresher the database adapter runs after reading a connection:
 * an OAuth access token is renewed when it is close to expiring, and the
 * rotated refresh token is what the adapter persists.
 *
 * In-process single-flight per connection: two parallel deploys share one
 * refresh, so a rotating refresh token is not spent twice. Across instances
 * that is still a race — the second refresh gets `invalid_grant` and the
 * connection is marked invalid rather than silently trying forever.
 *
 * The stub has no refresh endpoint worth calling, and stub connections are
 * never stored, so this is not installed for it.
 */
export function createConnectionRefresh(
  config?: CloudflareOAuthRuntime,
): ConnectionRefresh | undefined {
  if (!config || config.stub) return undefined

  const inFlight = new Map<
    string,
    Promise<{ credentials: string; token?: ConnectionTokenCheck } | null>
  >()

  return async (connection: Connection) => {
    // A dead grant is not refreshed on every read; reconnecting replaces it.
    if (connection.tokenStatus === 'invalid') return null
    const credentials = stored(connection.credentials)
    if (!credentials || credentials.authKind !== 'oauth') return null
    if (!credentials.refreshToken) return null
    const expiresAt = expiryTime(credentials)
    if (expiresAt !== null && expiresAt - Date.now() > REFRESH_MARGIN_MS) return null

    const running = inFlight.get(connection.id)
    if (running) return running
    const work = refreshOne(connection, credentials, config)
    inFlight.set(connection.id, work)
    try {
      return await work
    } finally {
      inFlight.delete(connection.id)
    }
  }
}

async function refreshOne(
  connection: Connection,
  credentials: StoredOAuthCredentials,
  config: CloudflareOAuthRuntime,
): Promise<{ credentials: string; token?: ConnectionTokenCheck } | null> {
  const checkedAt = new Date().toISOString()
  try {
    const tokens = await refreshAccessToken(config, credentials.refreshToken!)
    const ttl = tokens.expiresIn > 0 ? tokens.expiresIn : FALLBACK_TTL_SECONDS
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
    const next: StoredOAuthCredentials = {
      ...credentials,
      apiToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? credentials.refreshToken,
      expiresAt,
      ...(tokens.scope && { scopes: tokens.scope }),
    }
    log.info('Cloudflare OAuth token refreshed', {
      connectionId: connection.id,
      expiresIn: ttl,
    })
    return {
      credentials: JSON.stringify(next),
      // The connection renews itself: no expiry on the row, or the expiry notice fires.
      token: { status: 'active', expiresAt: null, checkedAt },
    }
  } catch (error) {
    if (error instanceof CloudflareOAuthError && error.code === 'invalid_grant') {
      log.warn('Cloudflare OAuth refresh refused; the connection must be reconnected', {
        connectionId: connection.id,
      })
      return {
        credentials: connection.credentials,
        token: { status: 'invalid', expiresAt: null, checkedAt },
      }
    }
    // An outage is not a dead grant: leave the row alone and let the call fail
    // with the provider's own answer.
    log.warn('Cloudflare OAuth refresh failed', {
      connectionId: connection.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
