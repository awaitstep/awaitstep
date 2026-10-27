import { describe, expect, it } from 'vitest'
import { inviteSummary, parseEmails, picksToPlaces } from '../invite-form'

describe('invite form', () => {
  it('splits a pasted list', () => {
    expect(parseEmails('sam@acme.test, joy@acme.test;\nkofi@acme.test  ')).toEqual([
      'sam@acme.test',
      'joy@acme.test',
      'kofi@acme.test',
    ])
  })

  it('turns picks into places with their roles, defaulting per kind', () => {
    expect(picksToPlaces(['p:prj_101', 'ws:prj_m:ws_d'], { 'ws:prj_m:ws_d': 'viewer' })).toEqual([
      { projectId: 'prj_101', workspaceId: null, role: 'member' },
      { projectId: 'prj_m', workspaceId: 'ws_d', role: 'viewer' },
    ])
  })

  it('says what the invites will give', () => {
    expect(inviteSummary(2, 'member', ['IT (Editor)'], 'Acme Inc')).toBe(
      '2 invites · they’ll open IT (Editor) and nothing else. The link expires in 7 days.',
    )
    expect(inviteSummary(1, 'admin', [], 'Acme Inc')).toBe(
      '1 invite · they’ll be org admins. The link expires in 7 days.',
    )
  })
})
