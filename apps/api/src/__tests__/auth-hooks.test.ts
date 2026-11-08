import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { handleOAuthUserInfo, linkOAuthAccount } from 'better-auth/oauth2'
import { createAuth, type AuthOptions } from '../auth/config.js'
import { deleteBlockedReason } from '@awaitstep/ir'
import { recordAccountEvent, recordOrganizationUpdate, recordSignIn } from '../lib/audit.js'
import { createSqliteApp, type SqliteApp } from './sqlite-app.js'

// better-auth itself, on the harness's real database: the organization
// hooks must close the member and invitation endpoints this API replaces
// without closing what better-auth does on its own behalf — creating an
// organization adds its creator as a member through the same `addMember`.

const BASE = 'http://localhost:8080'

function authOn(
  h: SqliteApp,
  onMagicLink?: (token: string) => void,
  extra: Partial<AuthOptions> = {},
) {
  return createAuth({
    baseURL: BASE,
    secret: 'x'.repeat(40),
    database: drizzleAdapter(h.db, { provider: 'sqlite', schema: h.schema }),
    rateLimit: false,
    onSessionCreated: (session) => recordSignIn(h.adapter, session),
    onOrganizationUpdated: (data) => recordOrganizationUpdate(h.adapter, data),
    deleteUserProblem: async (userId) =>
      deleteBlockedReason(await h.adapter.soleOwnedOrgNames(userId)),
    onAccountEvent: (event) => recordAccountEvent(h.adapter, event),
    ...(onMagicLink && { sendMagicLink: async ({ token }) => onMagicLink(token) }),
    ...extra,
  })
}

const post = (path: string, body: unknown, cookie?: string) =>
  new Request(`${BASE}/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  })

/** A signed-in session's cookie, through the magic-link flow. */
async function signIn(h: SqliteApp, email: string) {
  let token = ''
  const auth = authOn(h, (t) => {
    token = t
  })
  await auth.api.signInMagicLink({ body: { email }, headers: new Headers() })
  // The link as the email carries it: the redirect sets the session cookie.
  const verified = await auth.handler(
    new Request(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=/`),
  )
  expect(verified.status).toBe(302)
  const cookie = verified.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ')
  expect(cookie).toContain('session_token')
  return { auth, cookie }
}

describe('better-auth organization hooks', () => {
  it('still creates an organization with its creator as owner', async () => {
    const h = createSqliteApp()
    await h.seed.person('u-new', 'New Person', 'new@example.test')
    const auth = authOn(h)
    const org = await auth.api.createOrganization({
      body: { name: 'New Org', slug: 'new-org', userId: 'u-new' },
    })
    expect(org?.slug).toBe('new-org')
    expect(await h.adapter.getOrgRole(org!.id, 'u-new')).toBe('owner')
  })

  it('closes leaving before any session is read', async () => {
    const h = createSqliteApp()
    const res = await authOn(h).handler(post('/organization/leave', { organizationId: 'org-x' }))
    expect(res.status).toBe(403)
    expect((await res.json()).message).toMatch(/AwaitStep API/)
  })

  it('closes the member and invitation endpoints to a signed-in owner, with one message', async () => {
    const h = createSqliteApp()
    await h.seed.person('u-owner', 'Owner', 'owner@example.test')
    await h.seed.person('u-ben', 'Ben', 'ben@example.test')
    await h.seed.org('org-1', 'One', 'one')
    await h.seed.member('u-owner', 'org-1', 'owner')
    await h.seed.member('u-ben', 'org-1', 'member')
    const { auth, cookie } = await signIn(h, 'owner@example.test')
    // Each names a real member: the member hooks run once better-auth has found one.
    const calls: [string, unknown][] = [
      [
        '/organization/invite-member',
        { organizationId: 'org-1', email: 'x@example.test', role: 'member' },
      ],
      [
        '/organization/remove-member',
        { organizationId: 'org-1', memberIdOrEmail: 'ben@example.test' },
      ],
      [
        '/organization/update-member-role',
        { organizationId: 'org-1', memberId: 'm-org-1-u-ben', role: 'admin' },
      ],
      ['/organization/leave', { organizationId: 'org-1' }],
    ]
    for (const [path, body] of calls) {
      const res = await auth.handler(post(path, body, cookie))
      expect(res.status, path).toBe(403)
      expect((await res.json()).message, path).toMatch(/AwaitStep API/)
    }
    // The reads that would hand every member the organization's invitations (their ids are the links).
    for (const path of [
      '/organization/get-full-organization',
      '/organization/list-invitations',
      '/organization/list-members',
    ]) {
      const res = await auth.handler(
        new Request(`${BASE}/api/auth${path}?organizationId=org-1`, { headers: { cookie } }),
      )
      expect(res.status, path).toBe(403)
    }
    // The organization is untouched, and the session was a real one.
    expect(await h.adapter.getOrgRole('org-1', 'u-owner')).toBe('owner')
    expect(await h.adapter.getOrgRole('org-1', 'u-ben')).toBe('member')
  })
})

describe('the sign-in hook (B7)', () => {
  it('records a sign-in in the audit log of the person’s organization', async () => {
    const h = createSqliteApp()
    await h.seed.person('u-ama', 'Ama Mensah', 'ama@acme.test')
    await h.seed.org('org-acme', 'Acme', 'acme')
    await h.seed.member('u-ama', 'org-acme', 'owner')
    await signIn(h, 'ama@acme.test')
    const page = await h.adapter.listAuditEvents({
      organizationId: 'org-acme',
      since: '2000-01-01T00:00:00.000Z',
      hiddenEvents: [],
    })
    expect(page.data).toEqual([
      expect.objectContaining({ event: 'signin', actor: 'Ama Mensah', target: 'Acme' }),
    ])
  })
})

describe('names and organization changes (B7 security review)', () => {
  async function seeded() {
    const h = createSqliteApp()
    await h.seed.person('u-ama', 'Ama Mensah', 'ama@acme.test')
    await h.seed.org('org-acme', 'Acme', 'acme')
    await h.seed.member('u-ama', 'org-acme', 'owner')
    return { h, ...(await signIn(h, 'ama@acme.test')) }
  }

  it('refuses a name past 255 characters and strips direction overrides from one', async () => {
    const { h, auth, cookie } = await seeded()
    const long = await auth.handler(post('/update-user', { name: 'x'.repeat(256) }, cookie))
    expect(long.status).toBe(400)
    const sneaky = await auth.handler(
      post('/update-user', { name: 'Ama\u202E Mensah\u0000' }, cookie),
    )
    expect(sneaky.status).toBe(200)
    const [person] = await h.db
      .select({ name: h.schema.user.name })
      .from(h.schema.user)
      .where(eq(h.schema.user.id, 'u-ama'))
    expect(person!.name).toBe('Ama Mensah')
  })

  it('records an organization’s new name in its audit log', async () => {
    const { h, auth, cookie } = await seeded()
    const res = await auth.handler(
      post(
        '/organization/update',
        { organizationId: 'org-acme', data: { name: 'Acme Corp' } },
        cookie,
      ),
    )
    expect(res.status).toBe(200)
    const page = await h.adapter.listAuditEvents({
      organizationId: 'org-acme',
      since: '2000-01-01T00:00:00.000Z',
      hiddenEvents: [],
    })
    expect(page.data.find((e) => e.event === 'organization.update')).toMatchObject({
      actorId: 'u-ama',
      action: 'changed the settings of',
      target: 'Acme Corp',
      detail: 'URL: acme · Dashboard',
    })
  })
})

describe('your account (B10)', () => {
  async function seeded() {
    const h = createSqliteApp()
    await h.seed.person('u-ama', 'Ama Mensah', 'ama@acme.test')
    await h.seed.person('u-ben', 'Ben Okoro', 'ben@acme.test')
    await h.seed.org('org-acme', 'Acme', 'acme')
    await h.seed.member('u-ama', 'org-acme', 'owner')
    await h.seed.member('u-ben', 'org-acme', 'admin')
    return h
  }

  const events = (h: SqliteApp, organizationId = 'org-acme') =>
    h.sqlite
      .prepare(
        "SELECT event, action, actor_id AS actorId FROM audit_events WHERE organization_id = ? AND event <> 'signin' ORDER BY created_at",
      )
      .all(organizationId) as { event: string; action: string; actorId: string }[]

  async function linkGithub(h: SqliteApp, userId: string) {
    await h.db.insert(h.schema.account).values({
      id: `a-gh-${userId}`,
      accountId: `gh-${userId}`,
      providerId: 'github',
      userId,
      createdAt: '2026-10-21T00:00:00.000Z',
      updatedAt: '2026-10-21T00:00:00.000Z',
    })
  }

  describe('delete account', () => {
    it('refuses the only owner of an organization, even on better-auth’s own path', async () => {
      const h = await seeded()
      const { auth, cookie } = await signIn(h, 'ama@acme.test')
      const res = await auth.handler(post('/delete-user', {}, cookie))
      expect(res.status).toBe(409)
      expect((await res.json()).message).toBe("You're the only owner of Acme")
      expect(await h.adapter.getOrgRole('org-acme', 'u-ama')).toBe('owner')
      expect(events(h)).toEqual([])
    })

    it('deletes someone who owns nothing alone, records it first and drops their memberships', async () => {
      const h = await seeded()
      const { auth, cookie } = await signIn(h, 'ben@acme.test')
      const res = await auth.handler(post('/delete-user', {}, cookie))
      expect(res.status).toBe(200)
      expect(await h.adapter.getOrgRole('org-acme', 'u-ben')).toBeNull()
      expect(events(h)).toEqual([{ event: 'account.delete', action: 'deleted', actorId: 'u-ben' }])
    })

    it('hands the deleted account to the image cleanup, after the deletion', async () => {
      const h = await seeded()
      const deleted: { kind: string; id: string; stillThere: boolean }[] = []
      let token = ''
      const auth = authOn(h, (t) => (token = t), {
        onImageOwnerDeleted: async (owner) => {
          const row = h.sqlite.prepare('SELECT id FROM user WHERE id = ?').get(owner.id)
          deleted.push({ ...owner, stillThere: Boolean(row) })
        },
      })
      await auth.api.signInMagicLink({ body: { email: 'ben@acme.test' }, headers: new Headers() })
      const verified = await auth.handler(
        new Request(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=/`),
      )
      const cookie = verified.headers
        .getSetCookie()
        .map((c) => c.split(';')[0]!)
        .join('; ')
      expect((await auth.handler(post('/delete-user', {}, cookie))).status).toBe(200)
      expect(deleted).toEqual([{ kind: 'user', id: 'u-ben', stillThere: false }])
    })

    it('records a deletion as the deletion, not as its providers going', async () => {
      const h = await seeded()
      await linkGithub(h, 'u-ben')
      const { auth, cookie } = await signIn(h, 'ben@acme.test')
      expect((await auth.handler(post('/delete-user', {}, cookie))).status).toBe(200)
      expect(events(h).map((e) => e.event)).toEqual(['account.delete'])
    })

    it('asks for a fresh sign-in when the session is older than a day', async () => {
      const h = await seeded()
      const { auth, cookie } = await signIn(h, 'ben@acme.test')
      h.sqlite.prepare("UPDATE session SET createdAt = '2026-01-01T00:00:00.000Z'").run()
      const res = await auth.handler(post('/delete-user', {}, cookie))
      expect(res.status).toBe(400)
      expect(await h.adapter.getOrgRole('org-acme', 'u-ben')).toBe('admin')
    })

    it('closes the deletion callback: nothing mails a deletion link', async () => {
      const h = await seeded()
      const res = await authOn(h).handler(
        new Request(`${BASE}/api/auth/delete-user/callback?token=x`),
      )
      expect(res.status).toBe(403)
    })
  })

  describe('profile', () => {
    it('refuses any photo through update-user, and still clears one', async () => {
      const h = await seeded()
      const { auth, cookie } = await signIn(h, 'ama@acme.test')
      const update = (image: unknown) => auth.handler(post('/update-user', { image }, cookie))
      for (const image of [
        'data:image/webp;base64,UklGRg==',
        'https://evil.example/x.png',
        '/api/images/img_00000000000000000000000000000000',
        'https://avatars.githubusercontent.com/u/1',
      ]) {
        const res = await update(image)
        expect(res.status, image).toBe(400)
        expect((await res.json()).message).toBe('Upload the photo with PUT /api/account/photo')
      }
      expect((await h.adapter.getAccount('u-ama'))?.person.image).toBeNull()
      expect((await update(null)).status).toBe(200)
    })

    it('keeps a GitHub or Google avatar at sign-up and drops any other image', async () => {
      const h = await seeded()
      const c = { context: await authOn(h).$context }
      const signUp = async (id: string, image: string) => {
        const result = await handleOAuthUserInfo(
          c as never,
          {
            userInfo: { id, email: `${id}@example.test`, emailVerified: true, name: id, image },
            account: { providerId: 'google', accountId: id },
            profile: {},
            callbackURL: '/',
          } as never,
        )
        // Signed up either way: only the image is dropped.
        expect(result.data?.user.id, id).toEqual(expect.any(String))
        return result.data!.user.image ?? null
      }
      expect(await signUp('g-avatar', 'https://lh3.googleusercontent.com/a/x=s96-c')).toBe(
        'https://lh3.googleusercontent.com/a/x=s96-c',
      )
      expect(await signUp('g-pixel', 'https://evil.example/pixel.png')).toBeNull()
      expect(await signUp('g-inline', 'data:image/png;base64,iVBORw0KGgo=')).toBeNull()
    })

    it('refuses a name that isn’t text, or is empty once cleaned', async () => {
      const h = await seeded()
      const { auth, cookie } = await signIn(h, 'ama@acme.test')
      for (const name of [null, {}, ['x'], 42, '  ', '\u202e']) {
        const res = await auth.handler(post('/update-user', { name }, cookie))
        expect(res.status, JSON.stringify(name)).toBe(400)
      }
      expect((await h.adapter.getAccount('u-ama'))?.person.name).toBe('Ama Mensah')
    })

    it('never changes an email address, through any path', async () => {
      const h = await seeded()
      const { auth, cookie } = await signIn(h, 'ama@acme.test')
      expect((await auth.handler(post('/update-user', { email: 'x@y.test' }, cookie))).status).toBe(
        400,
      )
      const change = await auth.handler(post('/change-email', { newEmail: 'x@y.test' }, cookie))
      expect(change.status).toBeGreaterThanOrEqual(400)
      const context = await auth.$context
      await expect(
        context.internalAdapter.updateUser('u-ama', { email: 'x@y.test' }),
      ).rejects.toThrow(/can't be changed/)
      expect(await h.adapter.getAccount('u-ama')).toMatchObject({
        person: { email: 'ama@acme.test' },
      })
    })

    it('hands a deleted organization to the image cleanup, after the deletion', async () => {
      const h = await seeded()
      const deleted: { kind: string; id: string; stillThere: boolean }[] = []
      let token = ''
      const auth = authOn(h, (t) => (token = t), {
        onImageOwnerDeleted: async (owner) => {
          const row = h.sqlite.prepare('SELECT id FROM organization WHERE id = ?').get(owner.id)
          deleted.push({ ...owner, stillThere: Boolean(row) })
        },
      })
      await auth.api.signInMagicLink({ body: { email: 'ama@acme.test' }, headers: new Headers() })
      const verified = await auth.handler(
        new Request(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=/`),
      )
      const cookie = verified.headers
        .getSetCookie()
        .map((c) => c.split(';')[0]!)
        .join('; ')
      const res = await auth.handler(
        post('/organization/delete', { organizationId: 'org-acme' }, cookie),
      )
      expect(res.status).toBe(200)
      expect(deleted).toEqual([{ kind: 'org', id: 'org-acme', stillThere: false }])
    })

    it('refuses a logo through better-auth: it is uploaded with its own route', async () => {
      const h = await seeded()
      for (const logo of ['https://example.test/x.png', 'data:image/svg+xml;base64,PHN2Zz4=']) {
        await expect(
          authOn(h).api.createOrganization({
            body: { name: 'Logo', slug: 'logo', userId: 'u-ama', logo },
          }),
        ).rejects.toThrow('Upload the logo with PUT /api/orgs/:orgId/logo')
      }
      const plain = await authOn(h).api.createOrganization({
        body: { name: 'Plain', slug: 'plain', userId: 'u-ama' },
      })
      expect(plain?.slug).toBe('plain')
    })
  })

  describe('sessions', () => {
    it('answers the session without its bearer token', async () => {
      const h = await seeded()
      const { auth, cookie } = await signIn(h, 'ama@acme.test')
      const res = await auth.handler(
        new Request(`${BASE}/api/auth/get-session`, { headers: { cookie } }),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.session.id).toEqual(expect.any(String))
      expect(body.session).not.toHaveProperty('token')
      expect(body.session).not.toHaveProperty('ipAddress')
      expect(body.user.email).toBe('ama@acme.test')
      const info = await auth.handler(
        new Request(`${BASE}/api/auth/account-info?accountId=x`, { headers: { cookie } }),
      )
      expect(info.status).toBe(403)
    })

    it('closes better-auth’s session routes, which deal in bearer tokens', async () => {
      const h = await seeded()
      const { auth, cookie } = await signIn(h, 'ama@acme.test')
      const list = await auth.handler(
        new Request(`${BASE}/api/auth/list-sessions`, { headers: { cookie } }),
      )
      expect(list.status).toBe(403)
      expect((await list.json()).message).toMatch(/\/api\/account/)
      for (const path of [
        '/revoke-session',
        '/revoke-sessions',
        '/revoke-other-sessions',
        '/update-session',
        '/get-access-token',
        '/refresh-token',
      ]) {
        const res = await auth.handler(post(path, { token: 'x' }, cookie))
        expect(res.status, path).toBe(403)
      }
    })
  })

  describe('sign-in methods', () => {
    const google = (email: string, emailVerified: boolean) => ({
      userInfo: { id: 'g-123', email, emailVerified, name: 'Ama' },
      account: { providerId: 'google', accountId: 'g-123' },
      profile: {},
    })

    it('joins Google from Connect only with the account’s own verified address', async () => {
      const h = await seeded()
      const c = { context: await authOn(h).$context }
      const link = { userId: 'u-ama', email: 'ama@acme.test' }
      const other = await linkOAuthAccount(c as never, { link, ...google('ama@other.test', true) })
      expect(other).toMatchObject({
        linked: false,
        error: { code: expect.stringMatching(/email/i) },
      })
      const unverified = await linkOAuthAccount(c as never, {
        link,
        ...google('ama@acme.test', false),
      })
      expect(unverified).toMatchObject({ linked: false })
      expect((await h.adapter.getAccount('u-ama'))?.providers).toEqual([])
      const same = await linkOAuthAccount(c as never, { link, ...google('AMA@acme.test', true) })
      expect(same).toMatchObject({ linked: true })
      expect((await h.adapter.getAccount('u-ama'))?.providers.map((p) => p.providerId)).toEqual([
        'google',
      ])
    })

    it('joins Google at sign-in to the account with that verified address, never an unverified one', async () => {
      const h = await seeded()
      const c = { context: await authOn(h).$context }
      const refused = await handleOAuthUserInfo(c as never, {
        ...google('ama@acme.test', false),
        callbackURL: '/',
      })
      expect(refused).toMatchObject({ error: 'account not linked' })
      const signedIn = await handleOAuthUserInfo(c as never, {
        ...google('ama@acme.test', true),
        callbackURL: '/',
      })
      expect(signedIn.data?.user.id).toBe('u-ama')
      expect((await h.adapter.getAccount('u-ama'))?.providers.map((p) => p.providerId)).toEqual([
        'google',
      ])
    })

    it('asks for a fresh sign-in before a disconnect, as before a delete', async () => {
      const h = await seeded()
      await linkGithub(h, 'u-ama')
      const { auth, cookie } = await signIn(h, 'ama@acme.test')
      h.sqlite.prepare("UPDATE session SET createdAt = '2026-01-01T00:00:00.000Z'").run()
      const res = await auth.handler(post('/unlink-account', { accountId: 'a-gh-u-ama' }, cookie))
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe('SESSION_NOT_FRESH')
    })

    it('never counts a provider the instance turned off as the way in that stays', async () => {
      const h = await seeded()
      await linkGithub(h, 'u-ama')
      await h.db.insert(h.schema.account).values({
        id: 'a-go-u-ama',
        accountId: 'go-u-ama',
        providerId: 'google',
        userId: 'u-ama',
        createdAt: '2026-10-21T00:00:00.000Z',
        updatedAt: '2026-10-21T00:00:00.000Z',
      })
      const { cookie } = await signIn(h, 'ama@acme.test')
      // No email links, GitHub turned off: Google is the only way in that works.
      const googleOnly = authOn(h, undefined, { google: { clientId: 'g', clientSecret: 's' } })
      const res = await googleOnly.handler(
        post('/unlink-account', { accountId: 'a-go-u-ama' }, cookie),
      )
      expect(res.status).toBe(400)
      expect((await res.json()).message).toMatch(/only way to sign in/)
      // The turned-off GitHub may go: Google still signs in.
      const gh = await googleOnly.handler(
        post('/unlink-account', { accountId: 'a-gh-u-ama' }, cookie),
      )
      expect(gh.status).toBe(200)
    })

    it('lets the last provider go while email links sign in, and audits it', async () => {
      const h = await seeded()
      await linkGithub(h, 'u-ama')
      const { auth, cookie } = await signIn(h, 'ama@acme.test')
      const res = await auth.handler(post('/unlink-account', { accountId: 'a-gh-u-ama' }, cookie))
      expect(res.status).toBe(200)
      expect(await h.adapter.getAccount('u-ama')).toMatchObject({ providers: [] })
      expect(events(h)).toEqual([
        {
          event: 'account.method_disconnect',
          action: 'disconnected GitHub from',
          actorId: 'u-ama',
        },
      ])
    })

    it('keeps the last provider when the instance sends no email links', async () => {
      const h = await seeded()
      await linkGithub(h, 'u-ama')
      const { cookie } = await signIn(h, 'ama@acme.test')
      const withoutLinks = authOn(h)
      const res = await withoutLinks.handler(
        post('/unlink-account', { accountId: 'a-gh-u-ama' }, cookie),
      )
      expect(res.status).toBe(400)
      expect((await h.adapter.getAccount('u-ama'))?.providers).toHaveLength(1)
      expect(events(h)).toEqual([])
    })

    it('audits a provider joining an account', async () => {
      const h = await seeded()
      const context = await authOn(h).$context
      await context.internalAdapter.linkAccount({
        userId: 'u-ama',
        providerId: 'google',
        accountId: 'g-1',
      })
      expect(events(h)).toEqual([
        { event: 'account.method_connect', action: 'connected Google to', actorId: 'u-ama' },
      ])
    })
  })
})
