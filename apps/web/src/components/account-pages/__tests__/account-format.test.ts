import { describe, expect, it } from 'vitest'
import type { AccountOrg, AccountSession } from '../../../types/dashboard/account'
import {
  exportFileName,
  methodDetail,
  orgMeta,
  sessionActivity,
  sessionDetail,
} from '../account-format'

const NOW = new Date('2026-10-28T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const org = (patch: Partial<AccountOrg>): AccountOrg => ({
  id: 'org_acme',
  slug: 'acme',
  name: 'Acme Inc',
  initial: 'A',
  logo: null,
  role: 'owner',
  projectCount: 3,
  onlyOwner: true,
  ...patch,
})

const session = (patch: Partial<AccountSession>): AccountSession => ({
  id: 'ses',
  device: 'Safari on iPhone',
  kind: 'phone',
  ip: '203.0.113.x',
  signedInAt: hoursAgo(30),
  activeAt: hoursAgo(26),
  current: false,
  ...patch,
})

describe('orgMeta', () => {
  it('reads as the board: role, projects, and “the only owner”', () => {
    expect(orgMeta(org({}))).toBe('Owner · 3 projects · the only owner')
    expect(orgMeta(org({ role: 'member', projectCount: 1, onlyOwner: false }))).toBe(
      'Member · 1 project',
    )
  })
})

describe('sessions', () => {
  it('says when it signed in and was last active, lower case mid-sentence', () => {
    expect(sessionDetail(session({}), NOW)).toBe('203.0.113.x · signed in yesterday')
    expect(sessionActivity(session({}), NOW)).toBe('Active yesterday')
    expect(sessionActivity(session({ activeAt: hoursAgo(2) }), NOW)).toBe('Active 2h ago')
  })

  it('calls this device active now', () => {
    expect(sessionActivity(session({ current: true, activeAt: hoursAgo(5) }), NOW)).toBe(
      'Active now',
    )
  })
})

describe('methodDetail', () => {
  it('names the linked account and the day it was connected', () => {
    expect(
      methodDetail(
        { provider: 'github', account: 'ama-mensah', connectedAt: '2026-09-02T10:00:00Z' },
        NOW,
      ),
    ).toBe('ama-mensah · connected 2 Sep')
    expect(
      methodDetail({ provider: 'google', account: 'ama@acme.test', connectedAt: hoursAgo(0) }, NOW),
    ).toBe('ama@acme.test · connected just now')
  })

  it('says what connecting does, and where the email link goes', () => {
    expect(methodDetail({ provider: 'google', account: null, connectedAt: null }, NOW)).toBe(
      'Sign in with your Google account',
    )
    expect(
      methodDetail({ provider: 'email', account: 'ama@acme.test', connectedAt: null }, NOW),
    ).toBe('A one-time link sent to ama@acme.test')
  })
})

it('names the export after the day', () => {
  expect(exportFileName(NOW)).toBe('awaitstep-account-2026-10-28.json')
})
