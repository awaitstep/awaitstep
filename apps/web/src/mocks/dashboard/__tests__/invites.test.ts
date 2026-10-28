import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { AMA, DANIEL, LENA, TOMAS } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { invites, inbox, org } = mockServer
const as = (userId: string): MockContext => ({ userId, scenario: 'none' })
const daniel = as(DANIEL)

beforeEach(() => resetMockDb(new Date()))

describe('opening an invite', () => {
  it('shows Daniel his open Globex invite: Lena, Default in Globex Ops, Editor', async () => {
    const view = await invites.getInvite(daniel, 'inv_globex_daniel')
    expect(view).toMatchObject({
      state: 'open',
      viewerEmail: 'daniel@acme.test',
      invite: {
        org: { name: 'Globex', initial: 'G' },
        invitedBy: { name: 'Lena Ortiz' },
        orgRole: 'member',
        place: { kind: 'workspace', name: 'Default', projectName: 'Globex Ops', role: 'editor' },
      },
    })
  })

  it('says an invite older than 7 days has expired', async () => {
    expect(await invites.getInvite(daniel, 'inv_bolt_daniel')).toMatchObject({
      state: 'expired',
      askedForNew: false,
      invite: { invitedBy: { name: 'Tomás Barros' } },
    })
  })

  it('shows someone else an expired invite as theirs to switch from, not to ask about', async () => {
    expect((await invites.getInvite(as(AMA), 'inv_bolt_daniel')).state).toBe('wrong-account')
  })

  it('says it’s for another email when someone else opens it', async () => {
    expect(await invites.getInvite(daniel, 'inv_sam')).toMatchObject({
      state: 'wrong-account',
      viewerEmail: 'daniel@acme.test',
      invite: { email: 'sam@acme.test' },
    })
  })

  it('says an unknown or used invite is no longer open', async () => {
    expect(await invites.getInvite(daniel, 'nope')).toEqual({ state: 'gone' })
  })
})

describe('accepting', () => {
  it('joins Globex as a member, an Editor in Default, and lands there', async () => {
    const landing = await invites.acceptInvite(daniel, 'inv_globex_daniel')
    expect(landing).toEqual({ org: 'globex', project: 'globex-ops', workspace: 'default' })
    const db = getDb()
    expect(
      db.orgMembers.find((m) => m.orgId === 'org_globex' && m.userId === DANIEL),
    ).toMatchObject({ role: 'member' })
    expect(
      db.workspaceMembers.find((m) => m.workspaceId === 'ws_globex_default' && m.userId === DANIEL),
    ).toMatchObject({ role: 'editor' })
    expect(await invites.getInvite(daniel, 'inv_globex_daniel')).toEqual({ state: 'gone' })
  })

  it('refuses the wrong person, an expired invite and a declined one', async () => {
    await expect(invites.acceptInvite(as(AMA), 'inv_globex_daniel')).rejects.toMatchObject({
      status: 422,
    })
    await expect(invites.acceptInvite(daniel, 'inv_bolt_daniel')).rejects.toMatchObject({
      status: 422,
    })
    await invites.declineInvite(daniel, 'inv_globex_daniel')
    await expect(invites.acceptInvite(daniel, 'inv_globex_daniel')).rejects.toMatchObject({
      status: 409,
    })
  })
})

describe('declining', () => {
  it('tells the inviter, and Undo takes both back', async () => {
    await invites.declineInvite(daniel, 'inv_globex_daniel')
    expect((await invites.getInvite(daniel, 'inv_globex_daniel')).state).toBe('declined')
    let lena = await inbox.listNotifications(as(LENA), 'globex')
    expect(lena.map((n) => n.title)).toContain('Daniel Kim declined your invite to Globex')
    expect(await org.listInvitations(as(LENA), 'globex')).toEqual([])

    await invites.undoDeclineInvite(daniel, 'inv_globex_daniel')
    expect((await invites.getInvite(daniel, 'inv_globex_daniel')).state).toBe('open')
    lena = await inbox.listNotifications(as(LENA), 'globex')
    expect(lena.some((n) => n.title.includes('declined'))).toBe(false)
  })

  it('lets the org invite them again, replacing the declined one', async () => {
    await invites.declineInvite(daniel, 'inv_globex_daniel')
    const [again] = await org.sendInvites(as(LENA), 'globex', {
      emails: ['daniel@acme.test'],
      role: 'member',
      places: [],
    })
    expect(
      getDb().invitations.filter((i) => i.email === 'daniel@acme.test' && i.orgId === 'org_globex'),
    ).toHaveLength(1)
    expect(again!.email).toBe('daniel@acme.test')
  })
})

describe('asking for a new invite', () => {
  it('tells the inviter once, and Resend opens it again', async () => {
    await invites.askForNewInvite(daniel, 'inv_bolt_daniel')
    await invites.askForNewInvite(daniel, 'inv_bolt_daniel')
    expect(await invites.getInvite(daniel, 'inv_bolt_daniel')).toMatchObject({ askedForNew: true })
    const tomas = await inbox.listNotifications(as(TOMAS), 'bolt-labs')
    expect(
      tomas.filter((n) => n.title === 'Daniel Kim asked for a new invite to Bolt Labs'),
    ).toEqual([expect.objectContaining({ needsAction: true })])
    await org.resendInvite(as(TOMAS), 'bolt-labs', 'inv_bolt_daniel')
    expect((await invites.getInvite(daniel, 'inv_bolt_daniel')).state).toBe('open')
    // Resending answered it.
    const after = await inbox.listNotifications(as(TOMAS), 'bolt-labs')
    expect(after.some((n) => n.title.includes('asked for a new invite'))).toBe(false)
  })

  it('is only for an expired invite of your own', async () => {
    await expect(invites.askForNewInvite(daniel, 'inv_globex_daniel')).rejects.toMatchObject({
      status: 422,
    })
    await expect(invites.askForNewInvite(as(AMA), 'inv_bolt_daniel')).rejects.toMatchObject({
      status: 422,
    })
  })
})

describe('my invites', () => {
  it('lists Daniel’s open ones only, for Choose an organization', async () => {
    expect(await invites.listMyInvites(daniel)).toEqual([
      {
        token: 'inv_globex_daniel',
        org: { name: 'Globex', initial: 'G' },
        invitedBy: 'Lena Ortiz',
        orgRole: 'member',
      },
    ])
    expect(await invites.listMyInvites(as(AMA))).toEqual([])
  })
})
