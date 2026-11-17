import { describe, expect, it } from 'vitest'
import { oauthStartBody } from '../connections'

describe('oauthStartBody', () => {
  it('starts an organization connection', () => {
    expect(oauthStartBody('acme')).toEqual({ org: 'acme' })
  })

  it('names the project for a project-owned connection', () => {
    expect(oauthStartBody('acme', { project: 'billing' })).toEqual({
      org: 'acme',
      project: 'billing',
    })
  })

  it('names the workspace whose default it becomes', () => {
    expect(oauthStartBody('acme', { project: 'billing', workspaceId: 'ws-1' })).toEqual({
      org: 'acme',
      project: 'billing',
      workspaceId: 'ws-1',
    })
  })

  it('reconnects an existing connection in place', () => {
    expect(oauthStartBody('acme', { connectionId: 'c-1' })).toEqual({
      org: 'acme',
      connection: 'c-1',
    })
  })
})
