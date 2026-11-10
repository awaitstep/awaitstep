import { Hono, type Context } from 'hono'

/**
 * A development stand-in for Cloudflare's OAuth server.
 *
 * It answers the same four requests the provider's OAuth client makes —
 * authorize, token, accounts, revoke — so the flow can be clicked through
 * without a Cloudflare account, client ID or secret. It is mounted only by
 * the development entry; nothing here is reachable in a deployment.
 *
 * State lives in memory and dies with the process. An access token lasts an
 * hour, a code and a pending authorization ten minutes.
 */

export interface CloudflareOAuthStubAccount {
  id: string
  name: string
}

export interface CloudflareOAuthStubOptions {
  clientId: string
  clientSecret: string
  /** The callback the stub is allowed to send the code to; compared exactly. */
  redirectUri: string
  accounts?: CloudflareOAuthStubAccount[]
}

export const STUB_ACCOUNTS: CloudflareOAuthStubAccount[] = [
  { id: '0123456789abcdef0123456789abcdef', name: 'Acme Test Account' },
  { id: 'fedcba9876543210fedcba9876543210', name: 'Beta Test Account' },
]

const ACCESS_TTL_SECONDS = 3600
const CODE_TTL_MS = 10 * 60_000
const PENDING_TTL_MS = 10 * 60_000
/** A dev process should never accumulate without bound. */
const MAX_PENDING = 200
const MAX_CODES = 5_000
const MAX_TOKENS = 5_000

interface PendingAuthorization {
  state: string
  redirectUri: string
  scope: string
  codeChallenge: string
  expiresAt: number
}

interface AuthorizationCode {
  accountId: string
  redirectUri: string
  scope: string
  codeChallenge: string
  expiresAt: number
}

interface AccessGrant {
  accountId: string
  scope: string
  expiresAt: number
}

interface RefreshGrant {
  accountId: string
  scope: string
}

function randomId(): string {
  return crypto.randomUUID()
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function pkceMatches(challenge: string, verifier: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest)) === challenge
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 48px 20px; font: 15px/1.55 ui-sans-serif, system-ui, sans-serif;
    background: #f6f6f4; color: #1c1f24; display: flex; justify-content: center; }
  main { width: 100%; max-width: 520px; background: #fff; border: 1px solid #e2e2de;
    border-radius: 16px; padding: 28px 28px 24px; box-shadow: 0 1px 2px rgb(0 0 0 / .04); }
  h1 { margin: 0 0 6px; font-size: 19px; letter-spacing: -.01em; }
  p { margin: 0 0 18px; color: #5c6169; }
  .warn { border: 1px solid #e8d7a8; background: #fdf7e3; color: #6b5620;
    border-radius: 10px; padding: 10px 12px; font-size: 13px; margin-bottom: 20px; }
  fieldset { border: 1px solid #e5e5e0; border-radius: 12px; margin: 0 0 18px; padding: 12px 14px; }
  legend { padding: 0 6px; font-size: 12px; font-weight: 600; color: #3d424a; }
  label.account { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; cursor: pointer; }
  label.account input { margin-top: 3px; }
  .meta { display: block; color: #767c85; font-size: 12px; }
  ul { margin: 6px 0 0; padding-left: 18px; }
  li { margin: 3px 0; }
  code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px; }
  button { font: inherit; border-radius: 8px; padding: 9px 16px; cursor: pointer; border: 1px solid transparent; }
  .primary { background: #1c1f24; color: #fff; }
  .secondary { background: transparent; border-color: #d9d9d4; color: #1c1f24; }
  .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; font-weight: 600; font-size: 13px; }
  .dot { width: 20px; height: 20px; border-radius: 999px; background: #f48120; }
  a { color: #1c1f24; }
</style>
</head>
<body><main>${body}</main></body>
</html>`
}

function errorPage(message: string): string {
  return page(
    'Authorization failed',
    `<div class="brand"><span class="dot"></span> Cloudflare OAuth (test)</div>
<h1>Authorization failed</h1>
<p>${escapeHtml(message)}</p>
<p>Close this tab and try again from AwaitStep.</p>`,
  )
}

function signInPage(input: {
  pendingId: string
  action: string
  scopes: string[]
  accounts: CloudflareOAuthStubAccount[]
}): string {
  const accounts = input.accounts
    .map(
      (account, index) => `<label class="account">
<input type="radio" name="account" value="${escapeHtml(account.id)}"${index === 0 ? ' checked' : ''}>
<span>${escapeHtml(account.name)}<span class="meta">${escapeHtml(account.id)}</span></span>
</label>`,
    )
    .join('\n')
  const scopes = input.scopes
    .map((scope) => `<li><code>${escapeHtml(scope)}</code></li>`)
    .join('\n')
  return page(
    'Authorize AwaitStep',
    `<div class="brand"><span class="dot"></span> Cloudflare OAuth (test)</div>
<div class="warn">This is the local test backend, not Cloudflare. No real account or token is involved.</div>
<h1>Authorize AwaitStep</h1>
<p>AwaitStep would like to:</p>
<ul>${scopes || '<li>Read your account</li>'}</ul>
<form method="post" action="${escapeHtml(input.action)}">
  <input type="hidden" name="pending_id" value="${escapeHtml(input.pendingId)}">
  <fieldset>
    <legend>Choose an account</legend>
    ${accounts}
  </fieldset>
  <div class="actions">
    <button class="secondary" type="submit" name="decision" value="deny">Cancel</button>
    <button class="primary" type="submit" name="decision" value="approve">Authorize</button>
  </div>
</form>`,
  )
}

function jsonError(status: number, code: string, description: string) {
  return { status, body: { error: code, error_description: description } }
}

function apiError(status: number, message: string) {
  return {
    status,
    body: {
      success: false,
      errors: [{ code: 10000, message }],
      messages: [],
      result: null,
    },
  }
}

async function formBody(c: Context): Promise<Record<string, string>> {
  const parsed = await c.req.parseBody()
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/** The stub's OAuth server, to be mounted at `/dev/cloudflare-oauth`. */
export function createCloudflareOAuthStub(options: CloudflareOAuthStubOptions): Hono {
  const accounts = options.accounts ?? STUB_ACCOUNTS
  const pending = new Map<string, PendingAuthorization>()
  const codes = new Map<string, AuthorizationCode>()
  const accessTokens = new Map<string, AccessGrant>()
  const refreshTokens = new Map<string, RefreshGrant>()
  const app = new Hono()

  const bearerGrant = (authorization: string | undefined): AccessGrant | null => {
    if (!authorization?.startsWith('Bearer ')) return null
    const grant = accessTokens.get(authorization.slice('Bearer '.length))
    if (!grant) return null
    if (Date.now() > grant.expiresAt) {
      accessTokens.delete(authorization.slice('Bearer '.length))
      return null
    }
    return grant
  }

  const authenticateClient = (authorization: string | undefined, body: Record<string, string>) => {
    if (authorization?.startsWith('Basic ')) {
      try {
        return (
          atob(authorization.slice('Basic '.length)) ===
          `${options.clientId}:${options.clientSecret}`
        )
      } catch {
        return false
      }
    }
    return body.client_id === options.clientId && body.client_secret === options.clientSecret
  }

  const issue = (accountId: string, scope: string) => {
    const accessToken = `stub-access-${randomId()}`
    const refreshToken = `stub-refresh-${randomId()}`
    // Oldest entries go first; a dev server is not a token service.
    if (accessTokens.size >= MAX_TOKENS) {
      const oldest = accessTokens.keys().next().value
      if (oldest) accessTokens.delete(oldest)
    }
    if (refreshTokens.size >= MAX_TOKENS) {
      const oldest = refreshTokens.keys().next().value
      if (oldest) refreshTokens.delete(oldest)
    }
    if (codes.size >= MAX_CODES) {
      const oldest = codes.keys().next().value
      if (oldest) codes.delete(oldest)
    }
    accessTokens.set(accessToken, {
      accountId,
      scope,
      expiresAt: Date.now() + ACCESS_TTL_SECONDS * 1000,
    })
    refreshTokens.set(refreshToken, { accountId, scope })
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refreshToken,
      scope,
    }
  }

  app.get('/oauth2/auth', (c) => {
    const query = c.req.query()
    if (query.response_type !== 'code') {
      return c.html(errorPage('Only the authorization-code flow is supported.'), 400)
    }
    if (query.client_id !== options.clientId) {
      return c.html(errorPage('Unknown OAuth client.'), 400)
    }
    if (query.redirect_uri !== options.redirectUri) {
      return c.html(errorPage('That redirect URI is not registered on this client.'), 400)
    }
    if (!query.state || !query.code_challenge) {
      return c.html(errorPage('This authorization request is missing state or PKCE.'), 400)
    }
    if (query.code_challenge_method !== 'S256') {
      return c.html(errorPage('Only PKCE S256 is supported.'), 400)
    }

    if (pending.size >= MAX_PENDING) {
      return c.html(errorPage('Too many pending authorizations on this dev server.'), 429)
    }
    const pendingId = randomId()
    pending.set(pendingId, {
      state: query.state,
      redirectUri: query.redirect_uri,
      scope: query.scope ?? '',
      codeChallenge: query.code_challenge,
      expiresAt: Date.now() + PENDING_TTL_MS,
    })
    return c.html(
      signInPage({
        pendingId,
        action: new URL(c.req.url).pathname,
        scopes: (query.scope ?? '').split(/\s+/).filter(Boolean),
        accounts,
      }),
    )
  })

  app.post('/oauth2/auth', async (c) => {
    const body = await formBody(c)
    const auth = pending.get(body.pending_id ?? '')
    if (!auth || Date.now() > auth.expiresAt) {
      pending.delete(body.pending_id ?? '')
      return c.html(errorPage('This authorization expired. Start again from AwaitStep.'), 400)
    }
    pending.delete(body.pending_id ?? '')

    if (body.decision !== 'approve') {
      const url = new URL(auth.redirectUri)
      url.searchParams.set('error', 'access_denied')
      url.searchParams.set('state', auth.state)
      return c.redirect(url.toString(), 302)
    }

    const account = accounts.find((entry) => entry.id === body.account) ?? accounts[0]
    if (!account) return c.html(errorPage('No test account is configured.'), 500)

    const code = randomId()
    codes.set(code, {
      accountId: account.id,
      redirectUri: auth.redirectUri,
      scope: auth.scope,
      codeChallenge: auth.codeChallenge,
      expiresAt: Date.now() + CODE_TTL_MS,
    })
    const url = new URL(auth.redirectUri)
    url.searchParams.set('code', code)
    url.searchParams.set('state', auth.state)
    return c.redirect(url.toString(), 302)
  })

  app.post('/oauth2/token', async (c) => {
    const body = await formBody(c)
    if (!authenticateClient(c.req.header('authorization'), body)) {
      c.header('www-authenticate', 'Basic realm="cloudflare-oauth-stub"')
      const error = jsonError(401, 'invalid_client', 'Client authentication failed')
      return c.json(error.body, 401)
    }

    if (body.grant_type === 'authorization_code') {
      const record = codes.get(body.code ?? '')
      codes.delete(body.code ?? '')
      if (
        !record ||
        Date.now() > record.expiresAt ||
        record.redirectUri !== body.redirect_uri ||
        !body.code_verifier ||
        !(await pkceMatches(record.codeChallenge, body.code_verifier))
      ) {
        const error = jsonError(400, 'invalid_grant', 'The code is invalid or expired')
        return c.json(error.body, 400)
      }
      return c.json(issue(record.accountId, record.scope))
    }

    if (body.grant_type === 'refresh_token') {
      const grant = refreshTokens.get(body.refresh_token ?? '')
      refreshTokens.delete(body.refresh_token ?? '')
      if (!grant) {
        const error = jsonError(400, 'invalid_grant', 'The refresh token is invalid')
        return c.json(error.body, 400)
      }
      return c.json(issue(grant.accountId, grant.scope))
    }

    const error = jsonError(400, 'unsupported_grant_type', 'That grant type is not supported')
    return c.json(error.body, 400)
  })

  app.get('/client/v4/accounts', (c) => {
    const grant = bearerGrant(c.req.header('authorization'))
    if (!grant) {
      const error = apiError(401, 'Authentication error')
      return c.json(error.body, 401)
    }
    return c.json({
      success: true,
      errors: [],
      messages: [],
      result: accounts.filter((account) => account.id === grant.accountId),
    })
  })

  app.get('/client/v4/accounts/:id', (c) => {
    const grant = bearerGrant(c.req.header('authorization'))
    if (!grant) {
      const error = apiError(401, 'Authentication error')
      return c.json(error.body, 401)
    }
    if (grant.accountId !== c.req.param('id')) {
      const error = apiError(403, 'This token cannot reach that account')
      return c.json(error.body, 403)
    }
    const account = accounts.find((entry) => entry.id === grant.accountId)
    return c.json({ success: true, errors: [], messages: [], result: account ?? null })
  })

  app.post('/oauth2/revoke', async (c) => {
    const body = await formBody(c)
    if (body.token) {
      accessTokens.delete(body.token)
      refreshTokens.delete(body.token)
    }
    return c.json({})
  })

  app.get('/health', (c) => c.json({ ok: true, stub: 'cloudflare-oauth' }))

  return app
}
