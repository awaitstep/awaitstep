import { describe, expect, it } from 'vitest'
import { CLOUDFLARE_DEPLOY_SCOPES } from '../oauth.js'
import { CLOUDFLARE_PERMISSIONS, DEFAULT_CLOUDFLARE_OAUTH_SCOPES } from '../oauth-permissions.js'

describe('Cloudflare permissions', () => {
  it('requests exactly the scopes the token form lists, once each', () => {
    expect(DEFAULT_CLOUDFLARE_OAUTH_SCOPES).toEqual(CLOUDFLARE_PERMISSIONS.map((p) => p.scope))
    expect(new Set(DEFAULT_CLOUDFLARE_OAUTH_SCOPES).size).toBe(
      DEFAULT_CLOUDFLARE_OAUTH_SCOPES.length,
    )
  })

  it('asks for what deploying needs', () => {
    for (const scope of CLOUDFLARE_DEPLOY_SCOPES) {
      expect(DEFAULT_CLOUDFLARE_OAUTH_SCOPES).toContain(scope)
    }
  })
})
