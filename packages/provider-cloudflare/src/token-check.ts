import type { CredentialsInspection, InspectOptions } from '@awaitstep/codegen'

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const REQUEST_TIMEOUT_MS = 30_000
const ACCOUNT_ID = /^[a-zA-Z0-9_-]+$/

interface TokenVerifyBody {
  result?: { status?: string; expires_on?: string | null }
}

interface AccountsBody {
  result?: { id: string; name: string }[]
}

async function get(path: string, apiToken: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`${CF_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/** A definite "no" from Cloudflare: a 4xx that isn't a rate limit. */
function refused(res: Response): boolean {
  return res.status >= 400 && res.status < 500 && res.status !== 429
}

type Verified =
  | { status: 'active' | 'invalid'; expiresAt: string | null }
  | { status: 'unknown' }
  | { status: 'refused' }

async function verifyAt(path: string, apiToken: string): Promise<Verified> {
  let res: Response
  try {
    res = await get(path, apiToken)
  } catch {
    return { status: 'unknown' }
  }
  if (refused(res)) return { status: 'refused' }
  if (!res.ok) return { status: 'unknown' }
  let body: TokenVerifyBody
  try {
    body = (await res.json()) as TokenVerifyBody
  } catch {
    return { status: 'unknown' }
  }
  const expiresAt = isoOrNull(body.result?.expires_on)
  return { status: body.result?.status === 'active' ? 'active' : 'invalid', expiresAt }
}

/**
 * Asks Cloudflare whether a token works, when it expires, and — when an
 * account is named — whether it reaches that account. A user token verifies
 * at `/user/tokens/verify`; an account-owned token is refused there and
 * verifies at `/accounts/:id/tokens/verify`, which is tried next when the
 * account is known. Only a definite answer reads `invalid`; a timeout,
 * network error, 429 or 5xx reads `unknown`, so an outage never marks a
 * working token dead.
 */
export async function checkCloudflareToken(
  apiToken: string,
  accountId?: string,
  options: InspectOptions = {},
): Promise<CredentialsInspection> {
  const none = { accounts: [], accountReachable: null }
  if (!apiToken) return { status: 'invalid', expiresAt: null, ...none }
  const account = accountId && ACCOUNT_ID.test(accountId) ? accountId : undefined
  if (options.authKind === 'oauth') {
    return checkOAuthToken(apiToken, account, options)
  }

  let verified = await verifyAt('/user/tokens/verify', apiToken)
  let accountToken = false
  if (verified.status === 'refused' && account) {
    verified = await verifyAt(`/accounts/${account}/tokens/verify`, apiToken)
    accountToken = verified.status === 'active'
    // The user endpoint already said no: a fallback that can't answer doesn't undo it.
    if (verified.status === 'unknown' && options.settleRefusals) verified = { status: 'refused' }
  }
  if (verified.status === 'unknown') return { status: 'unknown', expiresAt: null, ...none }
  if (verified.status === 'refused') return { status: 'invalid', expiresAt: null, ...none }
  if (verified.status === 'invalid') {
    return { status: 'invalid', expiresAt: verified.expiresAt, ...none }
  }

  const [accounts, accountReachable] = await Promise.all([
    options.listAccounts ? listAccounts(apiToken) : Promise.resolve([]),
    // An account token verified at its own account reaches it by definition.
    account && options.checkAccount !== false && !accountToken
      ? reachesAccount(apiToken, account)
      : Promise.resolve(accountToken ? true : null),
  ])
  return { status: 'active', expiresAt: verified.expiresAt, accounts, accountReachable }
}

/**
 * An OAuth access token has no `/user/tokens/verify`. A grant that can still
 * read its chosen account is active; a refusal means it was revoked or the
 * account is out of the grant's scope, and anything unanswerable stays
 * unknown so an outage doesn't kill a working connection.
 */
async function checkOAuthToken(
  apiToken: string,
  account: string | undefined,
  options: InspectOptions,
): Promise<CredentialsInspection> {
  const none = { accounts: [], accountReachable: null }
  const expiresAt = options.expiresAt ?? null
  let res: Response
  try {
    res = await get(account ? `/accounts/${account}` : '/accounts?per_page=1', apiToken)
  } catch {
    return { status: 'unknown', expiresAt, ...none }
  }
  if (res.ok) {
    const accounts = options.listAccounts ? await listAccounts(apiToken) : []
    return {
      status: 'active',
      expiresAt,
      accounts,
      accountReachable: account ? true : null,
    }
  }
  // A 403 can mean the grant lacks the account-read scope, not that it is
  // dead; an expired access token refused here may just be awaiting a refresh
  // that couldn't reach Cloudflare. Both stay unknown.
  if (res.status === 403 || (refused(res) && options.expired)) {
    return { status: 'unknown', expiresAt, ...none, accountReachable: false }
  }
  if (refused(res)) {
    return { status: 'invalid', expiresAt, ...none, accountReachable: false }
  }
  return { status: 'unknown', expiresAt, ...none }
}

/** Accounts the token reaches (the first 50); empty when Cloudflare didn't say. */
async function listAccounts(apiToken: string): Promise<{ id: string; name: string }[]> {
  try {
    const res = await get('/accounts?per_page=50', apiToken)
    if (!res.ok) return []
    const body = (await res.json()) as AccountsBody
    return (body.result ?? []).map((a) => ({ id: a.id, name: a.name }))
  } catch {
    return []
  }
}

/** Whether the token can read the account: null when Cloudflare didn't say. */
async function reachesAccount(apiToken: string, accountId: string): Promise<boolean | null> {
  try {
    const res = await get(`/accounts/${accountId}`, apiToken)
    if (res.ok) return true
    return refused(res) ? false : null
  } catch {
    return null
  }
}
