import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuth } from '../auth/config.js'
import { recordOrganizationUpdate, recordSignIn } from '../lib/audit.js'
import { createSqliteApp, type SqliteApp } from './sqlite-app.js'

// better-auth itself, on the harness's real database: the organization
// hooks must close the member and invitation endpoints this API replaces
// without closing what better-auth does on its own behalf — creating an
// organization adds its creator as a member through the same `addMember`.

const BASE = 'http://localhost:8080'

function authOn(h: SqliteApp, onMagicLink?: (token: string) => void) {
  return createAuth({
    baseURL: BASE,
    secret: 'x'.repeat(40),
    database: drizzleAdapter(h.db, { provider: 'sqlite', schema: h.schema }),
    rateLimit: false,
    onSessionCreated: (session) => recordSignIn(h.adapter, session),
    onOrganizationUpdated: (data) => recordOrganizationUpdate(h.adapter, data),
    ...(onMagicLink && { sendMagicLink: async ({ token }) => onMagicLink(token) }),
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
    for (const path of ['/organization/get-full-organization', '/organization/list-invitations']) {
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
