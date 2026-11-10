import type { Context } from 'hono'
import { revokeToken } from '@awaitstep/provider-cloudflare'
import type { AppEnv } from '../types.js'
import { authKindOf } from './connection-fields.js'
import { parseCredentials } from './connection-token.js'
import { createLogger } from './logger.js'

const log = createLogger('connection-oauth')

/**
 * Withdraws an OAuth connection's Cloudflare grant before its row goes. Best
 * effort: a refusal is logged and the delete still happens. An API-token
 * connection has nothing to revoke.
 */
export async function revokeConnectionGrant(
  c: Context<AppEnv>,
  connection: { id: string; credentials: string },
): Promise<void> {
  const config = c.get('cloudflareOAuth')
  if (!config || authKindOf(connection.credentials) !== 'oauth') return
  const stored = parseCredentials(connection.credentials)
  const token = stored.refreshToken ?? stored.apiToken
  if (!token) return
  await revokeToken(config, token, stored.refreshToken ? 'refresh_token' : 'access_token').catch(
    (error: unknown) => {
      log.warn('Cloudflare OAuth revoke failed', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error),
      })
    },
  )
}
