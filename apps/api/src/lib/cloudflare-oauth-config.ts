import {
  DEFAULT_CLOUDFLARE_OAUTH_SCOPES,
  type CloudflareOAuthClientConfig,
} from '@awaitstep/provider-cloudflare'

/**
 * The Cloudflare OAuth client this deployment talks to.
 *
 * With a client ID and secret in the environment, that is Cloudflare. In
 * development without them, the API's own stub answers the same requests —
 * that is the test backend. Outside development an unconfigured instance has
 * no OAuth routes at all.
 *
 * The real client must be created with the `authorization_code` **and**
 * `refresh_token` grants: Cloudflare adds `offline_access` from those, and
 * without it no refresh token comes back.
 */
export interface CloudflareOAuthRuntime extends CloudflareOAuthClientConfig {
  /** True when the endpoints are the local stub, not Cloudflare. */
  stub: boolean
}

/**
 * What the connection needs to do its job: list the account, deploy, update
 * and take down Workers (and drive the Workflow instances the API owns), and
 * read/write KV for the Resources UI. Cloudflare's Workers scopes are
 * role-named: `workers-scripts.admin` (Admin) is required because AwaitStep
 * creates a Worker on first deploy, and Editor (`workers-scripts.edit`) may
 * only deploy one that already exists. `workers-scripts.write` is retired.
 *
 * Other products keep their own names. Add only what a feature uses:
 * `workers-r2.read`/`.write` and `workers-r2-bucket-item.read`/`.write`,
 * `d1.read`/`.write`, `queues.read`/`.write`, `workers-routes.read`/`.write`,
 * `workers-observability.read`, `workers-tail.read`, `secrets-store.write`,
 * `browser-rendering.read`/`.write`.
 *
 * Every requested scope must also be on the OAuth client: the request can ask
 * for less than the client allows, never more.
 *
 * The list itself lives in `@awaitstep/provider-cloudflare/oauth-permissions`,
 * beside its dashboard names, so the token form lists the same permissions.
 */
export { DEFAULT_CLOUDFLARE_OAUTH_SCOPES }

export const CLOUDFLARE_OAUTH_CALLBACK_PATH = '/api/oauth/cloudflare/callback'

function scopesFromEnv(value: string | undefined): string[] {
  const scopes = (value ?? '')
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
  return scopes.length > 0 ? [...new Set(scopes)] : DEFAULT_CLOUDFLARE_OAUTH_SCOPES
}

export function cloudflareOAuthFromEnv(
  env: Record<string, string | undefined>,
  options: { baseURL: string; isDev: boolean; originConfigured?: boolean },
): CloudflareOAuthRuntime | undefined {
  const origin = new URL(options.baseURL).origin
  const redirectUri =
    env['CLOUDFLARE_OAUTH_REDIRECT_URI'] || `${origin}${CLOUDFLARE_OAUTH_CALLBACK_PATH}`
  const scopes = scopesFromEnv(env['CLOUDFLARE_OAUTH_SCOPES'])

  const clientId = env['CLOUDFLARE_OAUTH_CLIENT_ID']
  const clientSecret = env['CLOUDFLARE_OAUTH_CLIENT_SECRET']
  if (clientId && clientSecret) {
    // A real client's callback must be a known origin, not whatever Host the
    // request arrived with: the redirect URI is registered on the client.
    if (options.originConfigured === false) return undefined
    return {
      stub: false,
      clientId,
      clientSecret,
      authorizeUrl: 'https://dash.cloudflare.com/oauth2/auth',
      tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
      revokeUrl: 'https://dash.cloudflare.com/oauth2/revoke',
      apiBaseUrl: 'https://api.cloudflare.com/client/v4',
      redirectUri,
      scopes,
    }
  }

  if (!options.isDev || env['CLOUDFLARE_OAUTH_STUB'] === '0') return undefined

  const stubBase = `${origin}/dev/cloudflare-oauth`
  return {
    stub: true,
    clientId: 'stub-client-id',
    clientSecret: 'stub-client-secret',
    authorizeUrl: `${stubBase}/oauth2/auth`,
    tokenUrl: `${stubBase}/oauth2/token`,
    revokeUrl: `${stubBase}/oauth2/revoke`,
    apiBaseUrl: `${stubBase}/client/v4`,
    redirectUri,
    scopes,
  }
}
