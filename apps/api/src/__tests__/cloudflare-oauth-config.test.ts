import { describe, expect, it } from 'vitest'
import {
  CLOUDFLARE_OAUTH_CALLBACK_PATH,
  DEFAULT_CLOUDFLARE_OAUTH_SCOPES,
  cloudflareOAuthFromEnv,
} from '../lib/cloudflare-oauth-config.js'

const BASE = 'http://localhost:8080'

describe('cloudflareOAuthFromEnv', () => {
  it('answers the local stub in development when no client is configured', () => {
    const config = cloudflareOAuthFromEnv({}, { baseURL: BASE, isDev: true })
    expect(config).toMatchObject({
      stub: true,
      clientId: 'stub-client-id',
      authorizeUrl: `${BASE}/dev/cloudflare-oauth/oauth2/auth`,
      tokenUrl: `${BASE}/dev/cloudflare-oauth/oauth2/token`,
      revokeUrl: `${BASE}/dev/cloudflare-oauth/oauth2/revoke`,
      apiBaseUrl: `${BASE}/dev/cloudflare-oauth/client/v4`,
      redirectUri: `${BASE}${CLOUDFLARE_OAUTH_CALLBACK_PATH}`,
      scopes: DEFAULT_CLOUDFLARE_OAUTH_SCOPES,
    })
  })

  it('prefers a real client over the stub, even in development', () => {
    const config = cloudflareOAuthFromEnv(
      {
        CLOUDFLARE_OAUTH_CLIENT_ID: 'real-id',
        CLOUDFLARE_OAUTH_CLIENT_SECRET: 'real-secret',
      },
      { baseURL: BASE, isDev: true },
    )
    expect(config).toMatchObject({
      stub: false,
      clientId: 'real-id',
      clientSecret: 'real-secret',
      authorizeUrl: 'https://dash.cloudflare.com/oauth2/auth',
      tokenUrl: 'https://dash.cloudflare.com/oauth2/token',
      revokeUrl: 'https://dash.cloudflare.com/oauth2/revoke',
      apiBaseUrl: 'https://api.cloudflare.com/client/v4',
    })
  })

  it('keeps the public origin and drops any path from the base URL', () => {
    const config = cloudflareOAuthFromEnv(
      {},
      { baseURL: 'https://api.example.com/base/', isDev: true },
    )
    expect(config?.redirectUri).toBe(`https://api.example.com${CLOUDFLARE_OAUTH_CALLBACK_PATH}`)
    expect(config?.authorizeUrl).toBe('https://api.example.com/dev/cloudflare-oauth/oauth2/auth')
  })

  it('takes an explicit redirect URI and scope list', () => {
    const config = cloudflareOAuthFromEnv(
      {
        CLOUDFLARE_OAUTH_CLIENT_ID: 'id',
        CLOUDFLARE_OAUTH_CLIENT_SECRET: 'secret',
        CLOUDFLARE_OAUTH_REDIRECT_URI: 'https://app.example.com/cb',
        CLOUDFLARE_OAUTH_SCOPES: 'account.read, workers-scripts.write  d1.write',
      },
      { baseURL: BASE, isDev: false },
    )
    expect(config?.redirectUri).toBe('https://app.example.com/cb')
    expect(config?.scopes).toEqual(['account.read', 'workers-scripts.write', 'd1.write'])
  })

  it('has no config outside development without a client', () => {
    expect(cloudflareOAuthFromEnv({}, { baseURL: BASE, isDev: false })).toBeUndefined()
  })

  it('lets development turn the stub off', () => {
    expect(
      cloudflareOAuthFromEnv({ CLOUDFLARE_OAUTH_STUB: '0' }, { baseURL: BASE, isDev: true }),
    ).toBeUndefined()
  })

  it('has no real client when the origin is not configured explicitly', () => {
    expect(
      cloudflareOAuthFromEnv(
        {
          CLOUDFLARE_OAUTH_CLIENT_ID: 'id',
          CLOUDFLARE_OAUTH_CLIENT_SECRET: 'secret',
        },
        { baseURL: BASE, isDev: false, originConfigured: false },
      ),
    ).toBeUndefined()
  })

  it('ignores half a client instead of building a broken one', () => {
    expect(
      cloudflareOAuthFromEnv({ CLOUDFLARE_OAUTH_CLIENT_ID: 'id' }, { baseURL: BASE, isDev: false }),
    ).toBeUndefined()
  })
})
