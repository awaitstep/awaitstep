/**
 * The OAuth 2.0 client for Cloudflare's self-managed OAuth clients.
 *
 * Endpoints are passed in rather than hardcoded: production points them at
 * `dash.cloudflare.com`, and the development stub points them at the API's
 * own `/dev/cloudflare-oauth`. The flow is authorization code with PKCE and
 * a client secret (`client_secret_basic`), since the exchange happens on the
 * server and the secret never reaches a browser.
 *
 * Cloudflare adds `offline_access` when the client is created with the
 * `refresh_token` grant, which is what makes a refresh token come back.
 */

/**
 * AwaitStep creates a Worker per workflow, and Cloudflare puts creating a
 * Worker under product-level Admin; Editor can only deploy one that exists.
 */
export const CLOUDFLARE_DEPLOY_SCOPES = ['workers-scripts.admin']

/** Unknown scopes stay optimistic: a grant stored before scope capture may still deploy. */
export function canDeployWithScopes(scopes: string[] | undefined): boolean {
  return scopes === undefined || scopes.some((scope) => CLOUDFLARE_DEPLOY_SCOPES.includes(scope))
}

export interface CloudflareOAuthClientConfig {
  clientId: string
  clientSecret: string
  /** `https://dash.cloudflare.com/oauth2/auth`. */
  authorizeUrl: string
  /** `https://dash.cloudflare.com/oauth2/token`. */
  tokenUrl: string
  /** `https://dash.cloudflare.com/oauth2/revoke`. */
  revokeUrl: string
  /** `https://api.cloudflare.com/client/v4` — where the granted account is read. */
  apiBaseUrl: string
  /** Must match the URI registered on the OAuth client, byte for byte. */
  redirectUri: string
  scopes: string[]
}

export interface CloudflareOAuthTokens {
  accessToken: string
  /** Null when the client has no `refresh_token` grant. */
  refreshToken: string | null
  /** Access-token lifetime in seconds as Cloudflare reported it; 0 when it did not say. */
  expiresIn: number
  scope: string
}

export interface CloudflareOAuthAccount {
  id: string
  name: string
}

export interface PkcePair {
  verifier: string
  challenge: string
}

/** A refusal from the token or API endpoint, with the OAuth error code when there is one. */
export class CloudflareOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'CloudflareOAuthError'
  }
}

const REQUEST_TIMEOUT_MS = 20_000
const PKCE_VERIFIER_BYTES = 32

/** Base64url without padding, from bytes. `btoa` exists in Node and Workers alike. */
function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

/** An opaque, unguessable `state` for one authorization attempt. */
export function createOAuthState(): string {
  return base64Url(randomBytes(24))
}

/** PKCE S256: a verifier and the challenge Cloudflare will compare it against. */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = base64Url(randomBytes(PKCE_VERIFIER_BYTES))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

/** Where the browser goes to authorize, with PKCE and `offline_access` by default. */
export function authorizationUrl(
  config: CloudflareOAuthClientConfig,
  input: {
    state: string
    codeChallenge: string
    scopes?: string[]
    /** False for a flow that keeps no token: a client without the refresh grant refuses it. */
    offlineAccess?: boolean
  },
): string {
  const url = new URL(config.authorizeUrl)
  const scopes = new Set(input.scopes ?? config.scopes)
  if (input.offlineAccess !== false) scopes.add('offline_access')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', [...scopes].join(' '))
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

async function postForm(
  url: string,
  form: Record<string, string>,
  client: { clientId: string; clientSecret: string },
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${btoa(`${client.clientId}:${client.clientSecret}`)}`,
      },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function tokensFrom(body: unknown): CloudflareOAuthTokens {
  const parsed = body as {
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
    scope?: unknown
  }
  if (typeof parsed?.access_token !== 'string' || parsed.access_token.length === 0) {
    throw new CloudflareOAuthError('Cloudflare returned no access token', 'invalid_response', 502)
  }
  const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 0
  return {
    accessToken: parsed.access_token,
    refreshToken: typeof parsed.refresh_token === 'string' ? parsed.refresh_token : null,
    expiresIn,
    scope: typeof parsed.scope === 'string' ? parsed.scope : '',
  }
}

async function readError(res: Response): Promise<CloudflareOAuthError> {
  let code = 'http_error'
  let description = `Cloudflare answered ${res.status}`
  try {
    const body = (await res.json()) as { error?: unknown; error_description?: unknown }
    if (typeof body.error === 'string') code = body.error
    if (typeof body.error_description === 'string') description = body.error_description
    else if (typeof body.error === 'string') description = body.error
  } catch {
    // A non-JSON error body keeps the status line above.
  }
  return new CloudflareOAuthError(description, code, res.status)
}

/** Exchanges the code from the callback for tokens, proving the PKCE verifier. */
export async function exchangeAuthorizationCode(
  config: CloudflareOAuthClientConfig,
  input: { code: string; codeVerifier: string },
): Promise<CloudflareOAuthTokens> {
  const res = await postForm(
    config.tokenUrl,
    {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: config.redirectUri,
      code_verifier: input.codeVerifier,
      client_id: config.clientId,
    },
    config,
  )
  if (!res.ok) throw await readError(res)
  return tokensFrom(await res.json())
}

/** Renews an access token; Cloudflare may rotate the refresh token, so keep the returned one. */
export async function refreshAccessToken(
  config: CloudflareOAuthClientConfig,
  refreshToken: string,
): Promise<CloudflareOAuthTokens> {
  const res = await postForm(
    config.tokenUrl,
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: config.clientId },
    config,
  )
  if (!res.ok) throw await readError(res)
  return tokensFrom(await res.json())
}

/** The accounts this grant reaches (the consent screen chose them). */
export async function listAuthorizedAccounts(
  config: CloudflareOAuthClientConfig,
  accessToken: string,
): Promise<CloudflareOAuthAccount[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${config.apiBaseUrl}/accounts?per_page=50`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) throw await readError(res)
  const body = (await res.json()) as { result?: { id?: unknown; name?: unknown }[] }
  return (body.result ?? []).flatMap((account) =>
    typeof account.id === 'string' && typeof account.name === 'string'
      ? [{ id: account.id, name: account.name }]
      : [],
  )
}

/** Withdraws the grant. Best effort: a failure is the caller's to log, not a reason to fail the action. */
export async function revokeToken(
  config: CloudflareOAuthClientConfig,
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token',
): Promise<void> {
  const res = await postForm(config.revokeUrl, { token, token_type_hint: tokenTypeHint }, config)
  if (!res.ok) throw await readError(res)
}
