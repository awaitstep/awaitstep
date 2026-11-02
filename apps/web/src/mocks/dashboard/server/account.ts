import { ONLY_WAY_IN, SIGN_IN_PROVIDERS, canDisconnect } from '@awaitstep/ir'
import type {
  Account,
  AccountExport,
  AccountOrg,
  AccountSession,
  ProfileUpdate,
  SignInMethod,
  SignInMethods,
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
// of whoever the dummy session is. The dummy instance turns on GitHub, Google
// and email links, as the board draws; the API source asks better-auth (B10).

/** The stored photo, as the API keeps it; the picker shrinks a pick first. */
const PHOTO_MAX_STORED = 512 * 1024
const PROVIDERS = { github: true, google: true, emailLink: true }

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
    emailVerified: true,
    orgs: orgs.map((o) => accountOrg(db, ctx, o)),
    deleteBlockedReason: deleteBlockedReason(db, ctx.userId, orgs),
  }
})

/** Save changes: the name shows wherever the person does. */
export const updateProfile = mutation((ctx, update: Pick<ProfileUpdate, 'name'>): void => {
  const db = getDb()
  const person = personById(db, ctx.userId)
  const name = update.name?.trim()
  if (name === '') throw invalidError('Your name can’t be empty', 'name')
  if (name) {
    person.name = name
    person.initials = initialsOf(name)
  }
})

/** Upload photo (a data URL of the picked blob), or null to remove it. */
export const setPhoto = mutation((ctx, image: string | null): void => {
  const person = personById(getDb(), ctx.userId)
  if (image) assertImage(image, 'image', PHOTO_MAX_STORED)
  person.image = image
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
  const linked = SIGN_IN_PROVIDERS.map((provider): SignInMethod => {
    const row = db.signInMethods.find((m) => m.userId === userId && m.provider === provider)
    return {
      provider,
      connected: row !== undefined,
      connectedAt: row?.connectedAt ?? null,
      accountId: row ? `${userId}_${provider}` : null,
    }
  })
  return [...linked, { provider: 'email', connected: true, connectedAt: null, accountId: null }]
}

function sessionsOf(db: MockDb, userId: string): AccountSession[] {
  return db.sessions
    .filter((s) => s.userId === userId)
    .sort((a, b) => Number(b.current) - Number(a.current) || b.activeAt.localeCompare(a.activeAt))
    .map(({ userId: _owner, ...session }) => session)
}

/** GitHub, Google and the email link. */
export const listSignInMethods = endpoint((ctx): SignInMethods => ({
  methods: signInMethods(getDb(), ctx.userId),
  providers: PROVIDERS,
  email: personById(getDb(), ctx.userId).email,
}))

/** Connect links the provider's account; the last one goes only while the email link signs in. */
export const setSignInMethod = mutation(
  (ctx, provider: SignInProvider, connected: boolean): void => {
    const db = getDb()
    const person = personById(db, ctx.userId)
    if (!connected && !canDisconnect(signInMethods(db, person.id), provider, PROVIDERS)) {
      throw conflictError(ONLY_WAY_IN)
    }
    db.signInMethods = db.signInMethods.filter(
      (m) => !(m.userId === person.id && m.provider === provider),
    )
    if (!connected) return
    db.signInMethods.push({ userId: person.id, provider, connectedAt: new Date().toISOString() })
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
      photo: person.image !== null,
    },
    signInMethods: signInMethods(db, person.id),
    sessions: sessionsOf(db, person.id),
    memberships: db.orgMembers
      .filter((m) => m.userId === person.id)
      .map((m) => ({
        organization: db.orgs.find((o) => o.id === m.orgId)?.name ?? m.orgId,
        role: m.role,
        projects: [],
        workspaces: [],
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
  db.signInMethods = db.signInMethods.filter((m) => m.userId !== person.id)
  db.sessions = db.sessions.filter((s) => s.userId !== person.id || s.current)
})
