import type {
  Account,
  AccountExport,
  AccountOrg,
  AccountSession,
  ProfileUpdate,
  SignInMethod,
  SignInProvider,
} from '../../../types/dashboard/account'
import { getDb, type MockDb, type OrgRow } from '../db'
import {
  type MockContext,
  conflictError,
  endpoint,
  invalidError,
  mutation,
  notFoundError,
  rows,
} from '../scenario'
import { initialsOf } from '../../../lib/initials'
import { listNames } from '../../../lib/name-list'
import { assertImage } from './images'
import { assertKeepsAnOwner, dropGrants, isOnlyOwner } from './org'
import { orgRecord, personById } from './records'
import { requireScope } from './resolve'

// Your account (P10): the profile, memberships, sign-in methods and sessions
// of whoever the dummy session is. Thin until B10 wires better-auth.

const PHOTO_TYPES = ['image/png', 'image/jpeg']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROVIDERS: SignInProvider[] = ['github', 'google']

function orgsOf(db: MockDb, userId: string): OrgRow[] {
  return db.orgMembers
    .filter((m) => m.userId === userId)
    .map((m) => db.orgs.find((o) => o.id === m.orgId))
    .filter((o) => o !== undefined)
}

/** Why the account can't be deleted: it would leave one of `orgs` with no owner. */
function deleteBlockedReason(db: MockDb, userId: string, orgs: OrgRow[]): string | null {
  const sole = orgs.filter((o) => isOnlyOwner(db, o, userId))
  return sole.length > 0 ? `You’re the only owner of ${listNames(sole.map((o) => o.name))}` : null
}

function accountOrg(db: MockDb, ctx: MockContext, org: OrgRow): AccountOrg {
  const summary = orgRecord(db, ctx, org)
  return {
    id: summary.id,
    slug: summary.slug,
    name: summary.name,
    initial: summary.initial,
    logo: summary.logo,
    role: summary.role,
    projectCount: summary.projectCount,
    onlyOwner: isOnlyOwner(db, org, ctx.userId),
  }
}

/** The Profile page: who you are, your orgs, and whether you can delete the account. */
export const getAccount = endpoint((ctx): Account => {
  const db = getDb()
  // One list for both, so `?mock=empty` can't list no orgs yet block on one.
  const orgs = rows(ctx, orgsOf(db, ctx.userId))
  return {
    person: personById(db, ctx.userId),
    pendingEmail: db.pendingEmails.find((p) => p.userId === ctx.userId)?.email ?? null,
    orgs: orgs.map((o) => accountOrg(db, ctx, o)),
    deleteBlockedReason: deleteBlockedReason(db, ctx.userId, orgs),
  }
})

/** Save changes (the name) and Upload photo: both show wherever the person does. */
export const updateProfile = mutation((ctx, update: ProfileUpdate): void => {
  const db = getDb()
  const person = personById(db, ctx.userId)
  const name = update.name?.trim()
  if (name === '') throw invalidError('Your name can’t be empty', 'name')
  if (update.image) assertImage(update.image, PHOTO_TYPES, 'image')
  if (name) {
    person.name = name
    person.initials = initialsOf(name)
  }
  if (update.image !== undefined) person.image = update.image
})

/**
 * Change email: records the new address and "sends" the confirmation. The
 * email itself only changes once that link is opened (B10).
 */
export const requestEmailChange = mutation((ctx, input: string): string => {
  const db = getDb()
  const person = personById(db, ctx.userId)
  const email = input.trim().toLowerCase()
  if (!EMAIL.test(email)) throw invalidError('Enter an email address', 'email')
  if (email === person.email.toLowerCase()) {
    throw invalidError('That’s already your email', 'email')
  }
  if (db.people.some((p) => p.id !== person.id && p.email.toLowerCase() === email)) {
    throw conflictError('Another account uses that email', 'email')
  }
  db.pendingEmails = db.pendingEmails.filter((p) => p.userId !== person.id)
  db.pendingEmails.push({ userId: person.id, email, sentAt: new Date().toISOString() })
  return email
})

/** Leave an organization: your project and workspace roles in it go too. */
export const leaveOrg = mutation((ctx, orgSlug: string): void => {
  const db = getDb()
  // Resolves only an org the viewer is in.
  const { org } = requireScope(db, ctx, { org: orgSlug })
  assertKeepsAnOwner(db, org, ctx.userId)
  dropGrants(db, org, ctx.userId)
  db.orgMembers = db.orgMembers.filter((m) => !(m.orgId === org.id && m.userId === ctx.userId))
})

function signInMethods(db: MockDb, userId: string): SignInMethod[] {
  const person = personById(db, userId)
  const linked = PROVIDERS.map((provider): SignInMethod => {
    const row = db.signInMethods.find((m) => m.userId === userId && m.provider === provider)
    return { provider, account: row?.account ?? null, connectedAt: row?.connectedAt ?? null }
  })
  return [...linked, { provider: 'email', account: person.email, connectedAt: null }]
}

function sessionsOf(db: MockDb, userId: string): AccountSession[] {
  return db.sessions
    .filter((s) => s.userId === userId)
    .sort((a, b) => Number(b.current) - Number(a.current) || b.activeAt.localeCompare(a.activeAt))
    .map(({ userId: _owner, ...session }) => session)
}

/** GitHub, Google and the email link; the instance's own list is B10. */
export const listSignInMethods = endpoint((ctx): SignInMethod[] =>
  signInMethods(getDb(), ctx.userId),
)

/** Connect links the provider's account; the email link is always on, so any can go. */
export const setSignInMethod = mutation(
  (ctx, provider: SignInProvider, connected: boolean): void => {
    const db = getDb()
    const person = personById(db, ctx.userId)
    db.signInMethods = db.signInMethods.filter(
      (m) => !(m.userId === person.id && m.provider === provider),
    )
    if (!connected) return
    db.signInMethods.push({
      userId: person.id,
      provider,
      account:
        provider === 'google' ? person.email : person.name.toLowerCase().replace(/\s+/g, '-'),
      connectedAt: new Date().toISOString(),
    })
  },
)

export const listSessions = endpoint((ctx): AccountSession[] =>
  rows(ctx, sessionsOf(getDb(), ctx.userId)),
)

/** Signs another device out. This device signs out for real, from the account menu or the row. */
export const revokeSession = mutation((ctx, sessionId: string): void => {
  const db = getDb()
  const session = db.sessions.find((s) => s.id === sessionId && s.userId === ctx.userId)
  if (!session) throw notFoundError()
  if (session.current) throw conflictError('Sign out of this device from the account menu')
  db.sessions = db.sessions.filter((s) => s.id !== sessionId)
})

export const revokeOtherSessions = mutation((ctx): void => {
  const db = getDb()
  db.sessions = db.sessions.filter((s) => s.userId !== ctx.userId || s.current)
})

/** Download JSON: profile, sign-in methods, sessions and memberships. */
export const exportAccount = endpoint((ctx): AccountExport => {
  const db = getDb()
  const person = personById(db, ctx.userId)
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      name: person.name,
      email: person.email,
      pendingEmail: db.pendingEmails.find((p) => p.userId === person.id)?.email ?? null,
      photo: person.image !== null,
    },
    signInMethods: signInMethods(db, person.id),
    sessions: sessionsOf(db, person.id),
    memberships: db.orgMembers
      .filter((m) => m.userId === person.id)
      .map((m) => ({
        organization: db.orgs.find((o) => o.id === m.orgId)?.name ?? m.orgId,
        role: m.role,
      })),
  }
})

/**
 * Delete account: refused while it would leave an org without an owner, and
 * until the person types their email. Their memberships, sign-in methods and
 * other sessions go; the dummy person stays so `?as=` keeps working.
 */
export const deleteAccount = mutation((ctx, confirmEmail: string): void => {
  const db = getDb()
  const person = personById(db, ctx.userId)
  const blocked = deleteBlockedReason(db, person.id, orgsOf(db, person.id))
  if (blocked) throw conflictError(blocked)
  if (confirmEmail.trim().toLowerCase() !== person.email.toLowerCase()) {
    throw invalidError('Type your email to confirm', 'email')
  }
  for (const org of orgsOf(db, person.id)) dropGrants(db, org, person.id)
  db.orgMembers = db.orgMembers.filter((m) => m.userId !== person.id)
  db.pendingEmails = db.pendingEmails.filter((p) => p.userId !== person.id)
  db.signInMethods = db.signInMethods.filter((m) => m.userId !== person.id)
  db.sessions = db.sessions.filter((s) => s.userId !== person.id || s.current)
})
