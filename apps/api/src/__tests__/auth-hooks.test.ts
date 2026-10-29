import { describe, it, expect } from 'vitest'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { createAuth } from '../auth/config.js'
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
