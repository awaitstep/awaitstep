import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { PRIYA_REQUEST } from '../fixtures/inbox'
import { AMA, DANIEL, PRIYA } from '../fixtures/people'
import { SALES } from '../fixtures/workspaces'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { inbox, requests } = mockServer
const as = (userId: string, scenario: MockContext['scenario'] = 'none'): MockContext => ({
  userId,
  scenario,
})
const ama = as(AMA)
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => resetMockDb(new Date()))

describe('notifications', () => {
  it('gives Ama the board’s six, newest first: three unread, four needing action', async () => {
    const list = await inbox.listNotifications(ama, 'acme')
    expect(list.map((n) => n.title)).toEqual([
      'Lead enrichment failed 3 times in the last hour, at step “Fetch company”',
      'Priya Shah asked for edit access to Sales',
      'API key “Read-only dashboard” expires in 3 days',
      'Cloudflare token for “Marketing sandbox” expires in 6 days. Deploys to it will stop.',
      'sam@acme.test accepted your invite',
      'Lena Ortiz deployed Provision account v7, shared with every workspace',
    ])
    expect(list.filter((n) => !n.read)).toHaveLength(3)
    expect(list.filter((n) => n.needsAction)).toHaveLength(4)
    expect(list.map((n) => n.where)).toEqual([
      'Project 101 · Sales',
      'Project 101 · Sales',
      'Project 101',
      'Acme Inc · Connections',
      'Acme Inc',
      'Project 101 · IT',
    ])
    expect(list[0]!.link).toEqual({ label: 'See runs', href: '/acme/project-101/sales/runs' })
    expect(list[1]!.request).toEqual({ id: PRIYA_REQUEST, status: 'pending', outcome: undefined })
  })

  it('builds links from today’s slugs, so a rename doesn’t break them', async () => {
    getDb().projects.find((p) => p.slug === 'project-101')!.slug = 'p101'
    const list = await inbox.listNotifications(ama, 'acme')
    expect(list[0]!.link!.href).toBe('/acme/p101/sales/runs')
  })

  it('marks one read, then all', async () => {
    await inbox.markNotificationRead(ama, 'acme', 'ntf_failing')
    let list = await inbox.listNotifications(ama, 'acme')
    expect(list.filter((n) => !n.read).map((n) => n.id)).toEqual([PRIYA_REQUEST, 'ntf_key'])
    await inbox.markAllNotificationsRead(ama, 'acme')
    list = await inbox.listNotifications(ama, 'acme')
    expect(list.every((n) => n.read)).toBe(true)
  })

  it('keeps each person’s inbox their own', async () => {
    expect(await inbox.listNotifications(as(DANIEL), 'acme')).toEqual([])
    await expect(
      inbox.markNotificationRead(as(DANIEL), 'acme', 'ntf_failing'),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('edit requests in the inbox', () => {
  it('approving makes Priya an Editor in Sales and closes her request', async () => {
    await inbox.decideEditRequest(ama, 'acme', PRIYA_REQUEST, 'approve')
    const row = (await inbox.listNotifications(ama, 'acme')).find((n) => n.id === PRIYA_REQUEST)!
    expect(row).toMatchObject({
      read: true,
      needsAction: false,
      request: { status: 'approved', outcome: 'Approved. Priya is now an Editor in Sales.' },
    })
    expect(
      getDb().workspaceMembers.find((m) => m.workspaceId === SALES && m.userId === PRIYA)!.role,
    ).toBe('editor')
    expect(await requests.getEditRequest(as(PRIYA), sales)).toBeNull()
  })

  it('declining tells her, and she may ask again', async () => {
    await inbox.decideEditRequest(ama, 'acme', PRIYA_REQUEST, 'decline')
    const row = (await inbox.listNotifications(ama, 'acme')).find((n) => n.id === PRIYA_REQUEST)!
    expect(row.request).toEqual({
      id: PRIYA_REQUEST,
      status: 'declined',
      outcome: 'Declined. Priya was told.',
    })
    expect(await requests.getEditRequest(as(PRIYA), sales)).toBeNull()
    const again = await requests.requestEditAccess(as(PRIYA), sales)
    expect(again.to.name).toBe('Ama Mensah')
    const list = await inbox.listNotifications(ama, 'acme')
    expect(list[0]).toMatchObject({
      title: 'Priya Shah asked for edit access to Sales',
      read: false,
      request: { status: 'pending' },
    })
  })

  it('answers once, and only for the person it was sent to', async () => {
    await inbox.decideEditRequest(ama, 'acme', PRIYA_REQUEST, 'decline')
    await expect(
      inbox.decideEditRequest(ama, 'acme', PRIYA_REQUEST, 'approve'),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      inbox.decideEditRequest(as(DANIEL), 'acme', PRIYA_REQUEST, 'approve'),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('never lowers a role raised since she asked', async () => {
    getDb().workspaceMembers.find((m) => m.workspaceId === SALES && m.userId === PRIYA)!.role =
      'admin'
    await inbox.decideEditRequest(ama, 'acme', PRIYA_REQUEST, 'approve')
    expect(
      getDb().workspaceMembers.find((m) => m.workspaceId === SALES && m.userId === PRIYA)!.role,
    ).toBe('admin')
    const row = (await inbox.listNotifications(ama, 'acme')).find((n) => n.id === PRIYA_REQUEST)!
    expect(row.request!.outcome).toBe('Approved. Priya could already edit in Sales.')
  })

  it('refuses to approve someone no longer in the workspace, and grants nothing', async () => {
    const db = getDb()
    db.workspaceMembers = db.workspaceMembers.filter(
      (m) => !(m.workspaceId === SALES && m.userId === PRIYA),
    )
    await expect(
      inbox.decideEditRequest(ama, 'acme', PRIYA_REQUEST, 'approve'),
    ).rejects.toMatchObject({ status: 422, message: 'Priya is no longer in Sales' })
    expect(db.workspaceMembers.some((m) => m.userId === PRIYA && m.workspaceId === SALES)).toBe(
      false,
    )
  })

  it('shows Priya’s page as already asked', async () => {
    expect(await requests.getEditRequest(as(PRIYA), sales)).toMatchObject({
      to: { name: 'Ama Mensah' },
    })
  })
})

describe('releases', () => {
  it('lists the app’s notes, the four since Ama’s last visit on 29 Oct new to her', async () => {
    const feed = await inbox.listReleases(ama, 'acme')
    expect(feed.lastVisit).toBe('2026-10-29T12:00:00.000Z')
    expect(feed.releases.map((r) => [r.id, r.fresh])).toEqual([
      ['rel_inbox', true],
      ['rel_audit', true],
      ['rel_d1_saves', true],
      ['rel_sharing', true],
      ['rel_lock', false],
      ['rel_variables', false],
      ['rel_keys', false],
      ['rel_workspaces', false],
    ])
    expect(feed.releases.find((r) => r.id === 'rel_keys')!.link.href).toBe('/acme/api-keys')
  })

  it('counts a note not yet seen as new, whatever its date', async () => {
    // An upgrade after her visit brought an old-dated note she never saw.
    getDb().releaseVisits[0]!.at = '2026-11-10T10:00:00.000Z'
    getDb().releaseVisits[0]!.seenIds = ['rel_inbox', 'rel_audit', 'rel_d1_saves', 'rel_sharing']
    const feed = await inbox.listReleases(ama, 'acme')
    expect(feed.releases.filter((r) => r.fresh).map((r) => r.id)).toEqual([
      'rel_lock',
      'rel_variables',
      'rel_keys',
      'rel_workspaces',
    ])
  })

  it('treats everything as new for someone who never looked, until they close it', async () => {
    const daniel = as(DANIEL)
    expect((await inbox.listReleases(daniel, 'acme')).releases.every((r) => r.fresh)).toBe(true)
    const shown = (await inbox.listReleases(daniel, 'acme')).releases.map((r) => r.id)
    await inbox.markReleasesSeen(daniel, shown)
    expect((await inbox.listReleases(daniel, 'acme')).releases.some((r) => r.fresh)).toBe(false)
    expect((await inbox.listReleases(ama, 'acme')).releases.filter((r) => r.fresh)).toHaveLength(4)
  })
})
