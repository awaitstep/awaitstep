import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { AMA, DANIEL, LENA, TOM } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { org, keys, setup, workspaces, projectConnections } = mockServer
const as = (userId: string): MockContext => ({ userId, scenario: 'none' })
const ama = as(AMA)

beforeEach(() => resetMockDb(new Date()))

describe('org members', () => {
  it('lists everyone with where they can work', async () => {
    const list = await org.listOrgMembers(ama, 'acme')
    const byId = Object.fromEntries(list.map((m) => [m.person.id, m]))
    expect(byId[AMA]).toMatchObject({ role: 'owner', places: [] })
    expect(
      byId[TOM]!.places.map((p) => [p.project.name, p.workspace?.name ?? null, p.role]),
    ).toEqual([
      ['Project 101', null, 'admin'],
      ['Internal Tools', null, 'member'],
    ])
    expect(byId[DANIEL]!.places.map((p) => [p.workspace?.name, p.role])).toEqual([
      ['Sales', 'editor'],
    ])
  })

  it('loads one person’s access and saves a new one', async () => {
    const access = await org.getPersonAccess(ama, 'acme', DANIEL)
    expect(access.draft.orgRole).toBe('member')
    expect(Object.values(access.draft.workspaces)).toEqual(['editor'])
    await org.saveAccess(ama, 'acme', DANIEL, {
      orgRole: 'member',
      projects: [{ projectId: 'prj_101', role: 'member' }],
      workspaces: [],
    })
    const after = await org.getPersonAccess(ama, 'acme', DANIEL)
    expect(after.draft.projects).toEqual({ prj_101: 'member' })
    expect(after.draft.workspaces).toEqual({})
  })

  it('never leaves the org without an owner', async () => {
    await expect(
      org.saveAccess(ama, 'acme', AMA, { orgRole: 'admin', projects: [], workspaces: [] }),
    ).rejects.toMatchObject({ status: 409, message: 'Make someone else an owner first' })
    await expect(org.removeFromOrg(ama, 'acme', AMA)).rejects.toMatchObject({ status: 409 })
  })

  it('removes someone with every grant they had in the org', async () => {
    await org.removeFromOrg(ama, 'acme', DANIEL)
    expect(getDb().orgMembers.some((m) => m.orgId === 'org_acme' && m.userId === DANIEL)).toBe(
      false,
    )
    expect(getDb().workspaceMembers.some((m) => m.userId === DANIEL)).toBe(false)
  })

  it('is for org owners and admins only', async () => {
    await expect(org.getPersonAccess(as(DANIEL), 'acme', TOM)).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('invitations', () => {
  it('sends one invite per email, refusing members, duplicates and bad addresses', async () => {
    await org.sendInvites(ama, 'acme', {
      emails: ['joy@acme.test', ' Kofi@acme.test '],
      role: 'member',
      places: [{ projectId: 'prj_101', workspaceId: 'ws_it', role: 'editor' }],
    })
    const list = await org.listInvitations(ama, 'acme')
    expect(list.map((i) => i.email)).toEqual(['sam@acme.test', 'joy@acme.test', 'kofi@acme.test'])
    expect(list[1]!.places).toEqual([
      { kind: 'workspace', project: 'Project 101', workspace: 'IT', role: 'editor' },
    ])
    const send = (email: string) =>
      org.sendInvites(ama, 'acme', { emails: [email], role: 'member', places: [] })
    await expect(send('daniel@acme.test')).rejects.toMatchObject({ field: 'emails' })
    await expect(send('sam@acme.test')).rejects.toMatchObject({ field: 'emails' })
    await expect(send('not-an-email')).rejects.toMatchObject({ field: 'emails' })
  })

  it('resends and cancels', async () => {
    const before = (await org.listInvitations(ama, 'acme'))[0]!.sentAt
    await org.resendInvite(ama, 'acme', 'inv_sam')
    expect((await org.listInvitations(ama, 'acme'))[0]!.sentAt > before).toBe(true)
    await org.cancelInvite(ama, 'acme', 'inv_sam')
    expect(await org.listInvitations(ama, 'acme')).toEqual([])
  })
})

describe('connections', () => {
  it('lists the board’s two accounts with their projects and tokens', async () => {
    const list = await org.listConnections(ama, 'acme')
    expect(list.map((c) => [c.name, c.accountSuffix])).toEqual([
      ['Acme production', '7f2a'],
      ['Marketing sandbox', '19c0'],
    ])
    expect(list[0]!.projects).toEqual([
      { id: 'prj_101', name: 'Project 101' },
      { id: 'prj_internal', name: 'Internal Tools' },
    ])
    expect(list[1]!.tokenExpiresAt).not.toBeNull()
  })

  it('connects with the form’s own checks, and setup sees it', async () => {
    await expect(
      org.connect(ama, 'acme', { name: 'X', accountId: 'nope', token: 't', projects: 'all' }),
    ).rejects.toMatchObject({ field: 'accountId' })
    getDb().connections = []
    expect((await setup.getProjectSetup(ama, 'acme', 'project-101')).cloudflareConnected).toBe(
      false,
    )
    const staging = await org.connect(ama, 'acme', {
      name: 'Staging',
      accountId: '0123456789abcdef0123456789abcdef',
      token: 'cf-token',
      projects: 'all',
    })
    // Available to the project isn't enough: the project adds it (23b).
    expect((await setup.getProjectSetup(ama, 'acme', 'project-101')).cloudflareConnected).toBe(
      false,
    )
    await projectConnections.addProjectConnections(ama, 'acme', 'project-101', [staging.id])
    expect((await setup.getProjectSetup(ama, 'acme', 'project-101')).cloudflareConnected).toBe(true)
  })

  it('replaces a token, edits projects, renames and removes', async () => {
    await org.replaceToken(ama, 'acme', 'conn_marketing', 'new-token')
    await org.updateConnection(ama, 'acme', 'conn_marketing', {
      name: 'Marketing',
      projects: ['prj_marketing', 'prj_101'],
    })
    const marketing = (await org.listConnections(ama, 'acme')).find(
      (c) => c.id === 'conn_marketing',
    )!
    expect(marketing).toMatchObject({ name: 'Marketing', tokenExpiresAt: null })
    expect(marketing.projects).toHaveLength(2)
    await org.removeConnection(ama, 'acme', 'conn_marketing')
    expect((await org.listConnections(ama, 'acme')).map((c) => c.id)).toEqual(['conn_production'])
  })
})

describe('the org itself', () => {
  it('takes a logo, renames and moves its URL', async () => {
    await org.setLogo(ama, 'acme', 'data:image/png;base64,AAAA')
    const updated = await org.updateOrg(ama, 'acme', { name: 'Acme Corp', slug: 'acme-corp' })
    expect(updated).toMatchObject({
      name: 'Acme Corp',
      slug: 'acme-corp',
      logo: 'data:image/png;base64,AAAA',
    })
    await expect(org.updateOrg(ama, 'acme-corp', { slug: 'settings' })).rejects.toMatchObject({
      field: 'slug',
    })
    await expect(org.updateOrg(ama, 'acme-corp', { slug: 'globex' })).rejects.toMatchObject({
      status: 409,
      field: 'slug',
    })
  })

  it('refuses a logo over 200 KB', async () => {
    const big = `data:image/png;base64,${'A'.repeat(300 * 1024)}`
    await expect(org.setLogo(ama, 'acme', big)).rejects.toMatchObject({ field: 'logo' })
  })

  it('deletes only an empty org, and only for owners', async () => {
    const scope = await workspaces.getScope(ama, { org: 'acme' })
    expect(scope.found && scope.org.viewerCan.delete).toEqual({
      allowed: false,
      reason: '3 projects still in it',
    })
    await expect(org.deleteOrg(ama, 'acme')).rejects.toMatchObject({ status: 403 })
    getDb().projects = getDb().projects.filter((p) => p.orgId !== 'org_acme')
    await expect(org.deleteOrg(as(LENA), 'acme')).rejects.toMatchObject({ status: 403 })
    await org.deleteOrg(ama, 'acme')
    expect(getDb().orgs.some((o) => o.id === 'org_acme')).toBe(false)
  })
})

describe('org keys', () => {
  it('lists the org’s keys and revokes one', async () => {
    expect((await keys.listOrgKeys(ama, 'acme')).map((k) => k.name)).toEqual([
      'Platform sync',
      'Terraform',
      'Onboarding bot',
    ])
    await keys.revokeOrgKey(ama, 'acme', 'key_terraform')
    expect((await keys.listOrgKeys(ama, 'acme')).map((k) => k.name)).toEqual([
      'Platform sync',
      'Onboarding bot',
    ])
    await expect(keys.revokeOrgKey(as(DANIEL), 'acme', 'key_onboarding')).rejects.toMatchObject({
      status: 403,
    })
  })

  it('refuses the org keys list to someone who isn’t an owner or admin', async () => {
    await expect(keys.listOrgKeys(as(DANIEL), 'acme')).rejects.toMatchObject({ status: 403 })
  })
})

describe('review round (2026-10-27)', () => {
  const makeAdmin = (userId: string) => {
    getDb().orgMembers.find((m) => m.orgId === 'org_acme' && m.userId === userId)!.role = 'admin'
  }

  it('lets only owners make an owner or change one', async () => {
    makeAdmin(TOM)
    const tom = as(TOM)
    await expect(
      org.saveAccess(tom, 'acme', TOM, { orgRole: 'owner', projects: [], workspaces: [] }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      org.saveAccess(tom, 'acme', AMA, { orgRole: 'member', projects: [], workspaces: [] }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(org.removeFromOrg(tom, 'acme', AMA)).rejects.toMatchObject({ status: 403 })
    // An admin still manages members.
    await org.saveAccess(tom, 'acme', DANIEL, { orgRole: 'member', projects: [], workspaces: [] })
  })

  it('refuses grants on another org’s projects', async () => {
    await expect(
      org.saveAccess(ama, 'acme', DANIEL, {
        orgRole: 'member',
        projects: [{ projectId: 'prj_globex_ops', role: 'member' }],
        workspaces: [],
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('names no project or workspace a plain member can’t open, in members, invites or connections', async () => {
    // Daniel opens Sales only: Marketing Site and Internal Tools are hidden from him,
    // and so is Project 101's IT workspace — where Lena's place and the invite's are.
    const daniel = as(DANIEL)
    const lena = (await org.listOrgMembers(daniel, 'acme')).find((m) => m.person.id === LENA)!
    expect(lena.places).toEqual([])
    const lenaForAma = (await org.listOrgMembers(ama, 'acme')).find((m) => m.person.id === LENA)!
    expect(lenaForAma.places.map((p) => [p.project.name, p.workspace?.name ?? null])).toEqual([
      ['Project 101', 'IT'],
      ['Marketing Site', null],
    ])
    const production = (await org.listConnections(daniel, 'acme')).find(
      (c) => c.id === 'conn_production',
    )!
    expect(production.projects).toEqual([{ id: 'prj_101', name: 'Project 101' }])
    getDb().invitations[0]!.places.push({
      projectId: 'prj_internal',
      workspaceId: null,
      role: 'member',
    })
    // The invitation list, whose ids are the invite links, is for owners and admins only.
    await expect(org.listInvitations(daniel, 'acme')).rejects.toMatchObject({ status: 403 })
    const forAma = (await org.listInvitations(ama, 'acme'))[0]!
    expect(forAma.places.map((p) => p.project)).toEqual(['Project 101', 'Internal Tools'])
  })

  it('drops a deleted workspace from an invitation’s places', async () => {
    getDb().workspaces = getDb().workspaces.filter((w) => w.id !== 'ws_it')
    expect((await org.listInvitations(ama, 'acme'))[0]!.places).toEqual([])
  })

  it('counts Cloudflare as connected only for a project with an account whose token is live', async () => {
    expect((await setup.getProjectSetup(ama, 'acme', 'project-101')).cloudflareConnected).toBe(true)
    const expired = new Date(Date.now() - 1000).toISOString()
    for (const id of ['conn_production', 'conn_checkout']) {
      getDb().connections.find((c) => c.id === id)!.tokenExpiresAt = expired
    }
    expect((await setup.getProjectSetup(ama, 'acme', 'project-101')).cloudflareConnected).toBe(
      false,
    )
  })
})
