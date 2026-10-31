import { vi } from 'vitest'

/** What the stubbed Cloudflare answers a token check with. */
export interface CloudflareAnswer {
  /** `down`: the verify call fails at the network. Default `active`. Both verify endpoints answer alike. */
  status?: 'active' | 'expired' | 'refused' | 'down'
  /** The token's `expires_on`; default none. */
  expiresOn?: string | null
  /** What `/accounts` lists, and what `/accounts/:id` finds; default one account, 0123…cdef. */
  accounts?: { id: string; name: string }[]
  /** An account-owned token: `/user/tokens/verify` refuses it, its account's verify answers. */
  accountToken?: boolean
  /** `/accounts/:id` fails (5xx): whether the token reaches it isn't known. */
  accountLookupFails?: boolean
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Stubs `fetch` for Cloudflare's token check: `/user/tokens/verify` and
 * `/accounts`. The answer may be a function, read per call, so a test can
 * change it between calls. Counts the verify calls made.
 */
export function stubCloudflare(answer: CloudflareAnswer | (() => CloudflareAnswer) = {}) {
  const calls = { verify: 0 }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const now = typeof answer === 'function' ? answer() : answer
      if (url.includes('/tokens/verify')) {
        calls.verify++
        if (now.accountToken && url.includes('/user/')) {
          return json(401, { success: false, errors: [{ code: 1000 }] })
        }
        if (now.status === 'down') throw new Error('network down')
        if (now.status === 'refused') return json(401, { success: false, errors: [{ code: 1000 }] })
        return json(200, {
          success: true,
          result: {
            status: now.status === 'expired' ? 'expired' : 'active',
            ...(now.expiresOn && { expires_on: now.expiresOn }),
          },
        })
      }
      const accounts = now.accounts ?? [{ id: '0123456789abcdef0123456789abcdef', name: 'Acme' }]
      if (url.includes('/accounts?')) return json(200, { success: true, result: accounts })
      const account = /\/accounts\/([^/?]+)$/.exec(url)?.[1]
      if (account) {
        if (now.accountLookupFails) return json(500, { success: false })
        return accounts.some((a) => a.id === account)
          ? json(200, { success: true, result: { id: account } })
          : json(403, { success: false })
      }
      throw new Error(`Unexpected fetch in a test: ${url}`)
    }),
  )
  return calls
}
