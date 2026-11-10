import { describe, expect, it } from 'vitest'
import { oauthStartUrl } from '../oauth-start'

describe('oauthStartUrl', () => {
  it('starts an organization connection', () => {
    expect(oauthStartUrl('acme')).toBe('/api/oauth/cloudflare/start?org=acme')
  })

  it('names the project for a project-owned connection', () => {
    expect(oauthStartUrl('acme', { project: 'billing' })).toBe(
      '/api/oauth/cloudflare/start?org=acme&project=billing',
    )
  })

  it('names the workspace whose default it becomes', () => {
    expect(oauthStartUrl('acme', { project: 'billing', workspaceId: 'ws-1' })).toBe(
      '/api/oauth/cloudflare/start?org=acme&project=billing&workspaceId=ws-1',
    )
  })

  it('reconnects an existing connection in place', () => {
    expect(oauthStartUrl('acme', { connectionId: 'c-1' })).toBe(
      '/api/oauth/cloudflare/start?org=acme&connection=c-1',
    )
  })
})
