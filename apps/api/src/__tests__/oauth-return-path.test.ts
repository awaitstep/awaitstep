import { describe, expect, it } from 'vitest'
import {
  checkOAuthReturnPath,
  DEFAULT_OAUTH_RETURN_PATH,
  oauthReturnUrl,
} from '../lib/oauth-return-path.js'

describe('checkOAuthReturnPath', () => {
  it('accepts a web app path naming {org}, with or without {project}', () => {
    expect(checkOAuthReturnPath('/{org}/ext/cloud/integrations')).toBe(
      '/{org}/ext/cloud/integrations',
    )
    expect(checkOAuthReturnPath(DEFAULT_OAUTH_RETURN_PATH)).toBe(DEFAULT_OAUTH_RETURN_PATH)
  })

  it('refuses anything that could send the browser off the web app', () => {
    for (const bad of [
      'https://evil.test/{org}',
      '//evil.test/{org}',
      '/\\evil.test/{org}',
      '{org}/integrations',
      'javascript:alert(1)//{org}',
    ]) {
      expect(() => checkOAuthReturnPath(bad), bad).toThrow(/must be a path in the web app/)
    }
  })

  it('refuses a query, a fragment or spaces: the callback writes the query', () => {
    expect(() => checkOAuthReturnPath('/{org}/x?tab=1')).toThrow(/no query, fragment/)
    expect(() => checkOAuthReturnPath('/{org}/x#top')).toThrow(/no query, fragment/)
    expect(() => checkOAuthReturnPath('/{org}/x y')).toThrow(/no query, fragment/)
  })

  it('refuses an unknown placeholder and a path without {org}', () => {
    expect(() => checkOAuthReturnPath('/{org}/{workspace}')).toThrow(/\{workspace\} is not/)
    expect(() => checkOAuthReturnPath('/integrations')).toThrow(/must name \{org\}/)
  })
})

describe('oauthReturnUrl', () => {
  const ok = { oauth: 'ok', connected: '1' }

  it('keeps today’s Connections pages by default', () => {
    expect(oauthReturnUrl('http://web.test', DEFAULT_OAUTH_RETURN_PATH, { org: 'acme' }, ok)).toBe(
      'http://web.test/acme/connections?oauth=ok&connected=1',
    )
    expect(
      oauthReturnUrl(
        'http://web.test/',
        DEFAULT_OAUTH_RETURN_PATH,
        { org: 'acme', project: 'checkout' },
        ok,
      ),
    ).toBe('http://web.test/acme/checkout/connections?oauth=ok&connected=1')
  })

  it('fills the named page with the slugs, encoded', () => {
    expect(
      oauthReturnUrl('http://web.test', '/{org}/ext/cloud/integrations', { org: 'a/b' }, ok),
    ).toBe('http://web.test/a%2Fb/ext/cloud/integrations?oauth=ok&connected=1')
  })
})
