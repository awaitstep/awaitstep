import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { AMA, DANIEL, LENA, PRIYA } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { account, session, invites, org } = mockServer
const as = (userId: string): MockContext => ({ userId, scenario: 'none' })
const ama = as(AMA)

beforeEach(() => resetMockDb(new Date()))

describe('the profile', () => {
  it('lists Ama’s orgs: the only owner of Acme, an admin in Bolt Labs', async () => {
    const view = await account.getAccount(ama)
    expect(view.person).toMatchObject({ name: 'Ama Mensah', email: 'ama@acme.test', image: null })
    expect(view.orgs.map((o) => [o.name, o.role, o.onlyOwner])).toEqual([
      ['Acme Inc', 'owner', true],
      ['Bolt Labs', 'admin', false],
    ])
    expect(view.deleteBlockedReason).toBe('You’re the only owner of Acme Inc')
  })

  it('lets someone who owns no org alone delete their account', async () => {
    expect((await account.getAccount(as(PRIYA))).deleteBlockedReason).toBeNull()
    // Daniel is the only owner of his sandbox.
    expect((await account.getAccount(as(DANIEL))).deleteBlockedReason).toBe(
      'You’re the only owner of Daniel’s sandbox',
    )
  })

  it('renames, with new initials, and the viewer reads the new name', async () => {
    await account.updateProfile(ama, { name: '  Ama K. Mensah ' })
    expect(await session.getViewer(ama)).toMatchObject({ name: 'Ama K. Mensah', initials: 'AK' })
  })

  it('refuses an empty name and a stored photo over 512 KB, as the API does', async () => {
    await expect(account.updateProfile(ama, { name: '  ' })).rejects.toMatchObject({
      status: 422,
      field: 'name',
    })
    const big = `data:image/png;base64,${'a'.repeat(720 * 1024)}`
    await expect(account.setPhoto(ama, big)).rejects.toMatchObject({ field: 'image' })
  })

  it('refuses a file that isn’t a type the API stores, and so does the org logo, SVG included', async () => {
    await expect(account.setPhoto(ama, 'data:application/pdf;base64,AAAA')).rejects.toMatchObject({
      status: 422,
      field: 'image',
      message: 'Pick a PNG, JPG, WebP or GIF image',
    })
    // The picker draws an SVG logo to a PNG first; an SVG itself is never stored.
    await expect(
      org.setLogo(ama, 'acme', 'data:image/svg+xml;base64,PHN2Zz4='),
    ).rejects.toMatchObject({ field: 'logo', message: 'Pick a PNG, JPG, WebP or GIF image' })
  })

  it('hands out copies: a later rename doesn’t change a record already read', async () => {
    const before = await account.getAccount(ama)
    await account.updateProfile(ama, { name: 'Ama K. Mensah' })
    expect(before.person.name).toBe('Ama Mensah')
  })

  it('shows the inviter’s photo on the invite page', async () => {
    getDb().people.find((p) => p.id === LENA)!.image = 'data:image/png;base64,AAAA'
    const view = await invites.getInvite(as(DANIEL), 'inv_globex_daniel')
    expect(view).toMatchObject({ invite: { invitedBy: { image: 'data:image/png;base64,AAAA' } } })
  })

  it('lists no orgs and blocks nothing under the empty scenario', async () => {
    const view = await account.getAccount({ userId: AMA, scenario: 'empty' })
    expect(view.orgs).toEqual([])
    expect(view.deleteBlockedReason).toBeNull()
  })

  it('keeps an uploaded photo on the person, so every avatar shows it', async () => {
    await account.setPhoto(ama, 'data:image/png;base64,AAAA')
    expect(getDb().people.find((p) => p.id === AMA)!.image).toBe('data:image/png;base64,AAAA')
    await account.setPhoto(ama, null)
    expect(getDb().people.find((p) => p.id === AMA)!.image).toBeNull()
  })
})

describe('leaving an organization', () => {
  it('takes Ama out of Bolt Labs with her roles there', async () => {
    getDb().projectMembers.push({ projectId: 'prj_bolt_api', userId: AMA, role: 'admin' })
    await account.leaveOrg(ama, 'bolt-labs')
    const db = getDb()
    expect(db.orgMembers.some((m) => m.orgId === 'org_bolt' && m.userId === AMA)).toBe(false)
    expect(db.projectMembers.some((m) => m.userId === AMA && m.projectId === 'prj_bolt_api')).toBe(
      false,
    )
    expect((await session.listOrgs(ama)).map((o) => o.name)).toEqual(['Acme Inc'])
  })

  it('refuses the only owner', async () => {
    await expect(account.leaveOrg(ama, 'acme')).rejects.toMatchObject({ status: 409 })
  })

  it('finds no org the viewer isn’t in', async () => {
    await expect(account.leaveOrg(ama, 'globex')).rejects.toMatchObject({ status: 404 })
  })
})

describe('deleting the account', () => {
  it('is refused while Ama is the only owner of Acme', async () => {
    await expect(account.deleteAccount(ama, 'ama@acme.test')).rejects.toMatchObject({
      status: 409,
    })
  })

  it('needs the email typed, then removes every membership', async () => {
    const priya = as(PRIYA)
    await expect(account.deleteAccount(priya, 'priya')).rejects.toMatchObject({ status: 422 })
    await account.deleteAccount(priya, 'PRIYA@acme.test')
    const db = getDb()
    expect(db.orgMembers.some((m) => m.userId === PRIYA)).toBe(false)
    expect(db.workspaceMembers.some((m) => m.userId === PRIYA)).toBe(false)
    expect(db.projectMembers.some((m) => m.userId === PRIYA)).toBe(false)
  })
})

describe('sign-in methods', () => {
  it('lists GitHub connected, Google not, and the email link', async () => {
    expect(await account.listSignInMethods(ama)).toEqual({
      methods: [
        {
          provider: 'github',
          connected: true,
          connectedAt: expect.any(String),
          accountId: expect.any(String),
        },
        { provider: 'google', connected: false, connectedAt: null, accountId: null },
        { provider: 'email', connected: true, connectedAt: null, accountId: null },
      ],
      providers: { github: true, google: true, emailLink: true },
      email: 'ama@acme.test',
    })
  })

  it('disconnects and connects again, the last one too while the email link signs in', async () => {
    await account.setSignInMethod(ama, 'github', false)
    await account.setSignInMethod(ama, 'google', true)
    const { methods } = await account.listSignInMethods(ama)
    expect(methods.map((m) => [m.provider, m.connected])).toEqual([
      ['github', false],
      ['google', true],
      ['email', true],
    ])
  })
})

describe('sessions', () => {
  it('lists Ama’s four, this device first', async () => {
    const list = await account.listSessions(ama)
    expect(list.map((s) => [s.device, s.current])).toEqual([
      ['Chrome on macOS', true],
      ['Firefox on Windows', false],
      ['Safari on iPhone', false],
      ['Unknown browser', false],
    ])
  })

  it('signs one out, but not this device', async () => {
    await account.revokeSession(ama, 'ses_ama_firefox')
    expect((await account.listSessions(ama)).map((s) => s.id)).not.toContain('ses_ama_firefox')
    await expect(account.revokeSession(ama, 'ses_ama_chrome')).rejects.toMatchObject({
      status: 409,
    })
    // Someone else's session isn't Ama's to sign out.
    await expect(account.revokeSession(ama, 'ses_daniel_chrome')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('signs out every other session and leaves other people’s alone', async () => {
    await account.revokeOtherSessions(ama)
    expect((await account.listSessions(ama)).map((s) => s.id)).toEqual(['ses_ama_chrome'])
    expect(await account.listSessions(as(DANIEL))).toHaveLength(1)
  })
})

describe('export', () => {
  it('holds the profile, methods, sessions and memberships', async () => {
    const data = await account.exportAccount(ama)
    expect(data.profile).toEqual({
      name: 'Ama Mensah',
      email: 'ama@acme.test',
      photo: false,
    })
    expect(data.signInMethods).toHaveLength(3)
    expect(data.sessions).toHaveLength(4)
    expect(data.memberships).toEqual([
      { organization: 'Acme Inc', role: 'owner', projects: [], workspaces: [] },
      { organization: 'Bolt Labs', role: 'admin', projects: [], workspaces: [] },
    ])
  })
})
