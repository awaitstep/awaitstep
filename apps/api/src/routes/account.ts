import { Hono } from 'hono'
import {
  SIGN_IN_PROVIDERS,
  deleteBlockedReason,
  describeUserAgent,
  maskIp,
  type AccountProviders,
  type AccountSession,
  type ApiAccount,
  type SignInMethod,
} from '@awaitstep/ir'
import type { AccountSessionRow } from '@awaitstep/db'
import { PHOTO_RULE } from '@awaitstep/storage'
import type { AppEnv } from '../types.js'
import { parseOrgRole } from '../lib/org-role.js'
import { recordAudit, recordPersonAudit } from '../lib/audit.js'
import { imageBodyLimit, readImageUpload } from '../lib/image-upload.js'
import { IMAGE_RACE, clearOwnerImage, saveOwnerImage } from '../lib/images.js'

// Your account (B10): the person's own rows, the same in every organization.
// Session only (the router's requireSessionAuth); no organization in the
// address. The name goes through better-auth's update-user, providers
// through its link/unlink, deletion through its delete-user — each guarded
// in auth/config.ts. The photo is uploaded here (`PUT /photo`): the hook
// refuses one through update-user.

const KEEP_AN_OWNER = 'Make someone else an owner first'

/** Who has no way in when the instance turns nothing on: never listed. */
const NO_PROVIDERS: AccountProviders = { github: false, google: false, emailLink: false }

function signInMethods(
  providers: AccountProviders,
  linked: { id: string; providerId: string; connectedAt: string }[],
): SignInMethod[] {
  const methods: SignInMethod[] = SIGN_IN_PROVIDERS.filter(
    (provider) => providers[provider] || linked.some((l) => l.providerId === provider),
  ).map((provider) => {
    const link = linked.find((l) => l.providerId === provider)
    return {
      provider,
      connected: Boolean(link),
      connectedAt: link?.connectedAt ?? null,
      accountId: link?.id ?? null,
    }
  })
  if (providers.emailLink) {
    methods.push({ provider: 'email', connected: true, connectedAt: null, accountId: null })
  }
  return methods
}

function sessionOf(row: AccountSessionRow): AccountSession {
  return {
    id: row.id,
    ...describeUserAgent(row.userAgent),
    ip: maskIp(row.ipAddress),
    signedInAt: row.createdAt,
    activeAt: row.updatedAt,
    current: row.current,
  }
}

export const account = new Hono<AppEnv>()

account.get('/', async (c) => {
  const providers = c.get('accountProviders') ?? NO_PROVIDERS
  const row = await c.get('db').getAccount(c.get('userId'))
  if (!row) return c.json({ error: 'Not found' }, 404)
  const body: ApiAccount = {
    person: row.person,
    orgs: row.orgs.map((org) => ({ ...org, role: parseOrgRole(org.role) })),
    deleteBlockedReason: deleteBlockedReason(
      row.orgs.filter((org) => org.onlyOwner).map((org) => org.name),
    ),
    signInMethods: signInMethods(providers, row.providers),
    providers,
  }
  return c.json(body)
})

/** Leave an organization, with every row of theirs in it, as one unit. The only owner can't. */
account.post('/orgs/:orgId/leave', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const org = await db.getOrganizationIfMember(userId, { id: c.req.param('orgId') })
  if (!org) return c.json({ error: 'Not found' }, 404)
  // The unit refuses the only owner in its WHERE; on false, read back whether
  // that was it or the row went in the meantime.
  if (!(await db.removeOrgMember(org.id, userId, { callerIsOwner: true }))) {
    return (await db.getOrgRole(org.id, userId)) === null
      ? c.json({ error: 'Not found' }, 404)
      : c.json({ error: KEEP_AN_OWNER }, 409)
  }
  await recordAudit(c, { event: 'member.leave', facts: { name: org.name }, organizationId: org.id })
  return c.json({ ok: true })
})

account.get('/sessions', async (c) => {
  const rows = await c
    .get('db')
    .listAccountSessions(c.get('userId'), c.get('session')!.id, new Date())
  return c.json({ data: rows.map(sessionOf) })
})

/** Signs out every other session (`?scope=others`). */
account.delete('/sessions', async (c) => {
  if (c.req.query('scope') !== 'others') {
    return c.json({ error: 'Name a session, or pass scope=others' }, 400)
  }
  const count = await c.get('db').revokeOtherAccountSessions(c.get('userId'), c.get('session')!.id)
  if (count > 0) await recordPersonAudit(c, 'session.revoke', { name: '', count })
  return c.json({ count })
})

account.delete('/sessions/:id', async (c) => {
  const currentId = c.get('session')!.id
  const sessionId = c.req.param('id')
  if (sessionId === currentId) {
    return c.json({ error: 'This is the session you are using: sign out instead' }, 400)
  }
  const gone = await c.get('db').revokeAccountSession(c.get('userId'), sessionId, currentId)
  if (!gone) return c.json({ error: 'Not found' }, 404)
  await recordPersonAudit(c, 'session.revoke', { name: '', count: 1 })
  return c.json({ ok: true })
})

/** Download JSON: the person's own rows, nothing their organizations own. */
// A POST: it writes audit rows and spends a budget, so a cross-site navigation must not trigger it.
account.post('/export', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const providers = c.get('accountProviders') ?? NO_PROVIDERS
  const row = await db.exportAccount(userId, c.get('session')!.id, new Date())
  if (!row) return c.json({ error: 'Not found' }, 404)
  await recordPersonAudit(c, 'account.export', { name: '' })
  return c.json({
    exportedAt: new Date().toISOString(),
    profile: { name: row.name, email: row.email, photo: row.photo },
    signInMethods: signInMethods(providers, row.providers),
    sessions: row.sessions.map(sessionOf),
    memberships: row.memberships.map((m) => ({ ...m, role: parseOrgRole(m.role) })),
  })
})

/** Uploads the profile photo: the image as the body. Answers its path. */
account.put('/photo', imageBodyLimit(PHOTO_RULE, 'image'), async (c) => {
  const upload = await readImageUpload(c, PHOTO_RULE)
  if ('problem' in upload) return c.json({ error: upload.problem, field: 'image' }, 400)
  const owner = { kind: 'user' as const, id: c.get('userId') }
  const image = await saveOwnerImage(
    c.get('db'),
    c.get('imageStore'),
    owner,
    upload.bytes,
    upload.info,
  )
  if (!image) return c.json({ error: IMAGE_RACE }, 409)
  return c.json({ image })
})

/** Removes the profile photo: the initials show instead. */
account.delete('/photo', async (c) => {
  await clearOwnerImage(c.get('db'), c.get('imageStore'), { kind: 'user', id: c.get('userId') })
  return c.json({ image: null })
})
