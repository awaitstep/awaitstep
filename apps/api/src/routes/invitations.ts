import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { grantCounts, inheritedWorkspaceRole } from '@awaitstep/ir'
import { isUniqueViolation } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import {
  describePlace,
  inviteDetails,
  inviteLanding,
  inviteViewRecord,
  invitationRecord,
  pendingInviteRecord,
} from '../lib/access-records.js'
import type { AppEnv } from '../types.js'

export const INVITE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
/** One resend per invitation per this long: the email again, not a stream of them. */
export const RESEND_FLOOR_MS = 10 * 60 * 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TOO_MANY_EMAILS = 'Too many invitation emails sent in the last hour. Try again later'

const placeSchema = z.object({
  projectId: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  role: z.enum(['admin', 'member', 'editor', 'viewer']),
})

const sendSchema = z.object({
  emails: z.array(z.string().trim().min(3).max(254)).min(1).max(20),
  role: z.enum(['member', 'admin']),
  places: z.array(placeSchema).max(100).default([]),
})

function expiresFrom(now: Date): string {
  return new Date(now.getTime() + INVITE_DAYS * DAY_MS).toISOString()
}

/** The session's address and whether it is proven: an invite is claimed on the address alone. */
function viewerOf(c: Context<AppEnv>) {
  const user = c.get('user')
  return { email: user?.email ?? '', emailVerified: user?.emailVerified === true }
}

type Place = z.infer<typeof placeSchema>

/** A place's role must fit its level: project roles project-wide, workspace roles in a workspace. */
function placeProblem(place: Place): string | null {
  const projectWide = place.workspaceId === null
  if (projectWide && (place.role === 'editor' || place.role === 'viewer')) {
    return 'A project-wide place takes a project role'
  }
  if (!projectWide && place.role === 'member') return 'A workspace place takes a workspace role'
  return null
}

/**
 * The places as a set: none twice, and no workspace place in a project a
 * project-wide place already covers at that level or above (`grantCounts`
 * — the same floor a workspace's own grants have).
 */
function placesProblem(places: Place[]): string | null {
  const seen = new Set<string>()
  const projectWide = new Map(
    places.filter((p) => p.workspaceId === null).map((p) => [p.projectId, p.role]),
  )
  for (const place of places) {
    const problem = placeProblem(place)
    if (problem) return problem
    const key = `${place.projectId}/${place.workspaceId ?? ''}`
    if (seen.has(key)) return 'A place is named twice'
    seen.add(key)
    if (place.workspaceId === null) continue
    const projectRole = projectWide.get(place.projectId)
    if (projectRole === 'admin' || projectRole === 'member') {
      const floor = inheritedWorkspaceRole(projectRole)
      if (!grantCounts(place.role as 'admin' | 'editor' | 'viewer', floor)) {
        return `The project-wide place already gives ${floor} access to that workspace`
      }
    }
  }
  return null
}

/**
 * Invitations into an organization. The collection is addressed by `?org=`
 * (the router's requireOrganization, owners and admins); an invitation is
 * addressed by its id, which is the link's token, and answered by the
 * session whose email it names. Session-only throughout.
 */
export const invitations = new Hono<AppEnv>()

invitations.get('/', async (c) => {
  const rows = await c
    .get('db')
    .listInvitations(c.get('organizationId'), c.get('userId'), new Date().toISOString())
  return c.json({ data: rows.map(invitationRecord) })
})

/** Invite people: one pending invitation per address, each emailed. */
invitations.post('/', zValidator('json', sendSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const body = c.req.valid('json')
  const emails = [...new Set(body.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  const bad = emails.find((e) => !EMAIL.test(e))
  if (bad) {
    return c.json(
      {
        error: 'Validation failed',
        details: [{ path: 'emails', message: `“${bad}” isn’t an email address` }],
      },
      422,
    )
  }
  const places = body.role === 'member' ? body.places : []
  const problem = placesProblem(places)
  if (problem) {
    return c.json(
      { error: 'Validation failed', details: [{ path: 'places', message: problem }] },
      422,
    )
  }

  // One read of every check: the places' ids are the organization's, and
  // no address is already in it or already invited.
  const now = new Date()
  const projectIds = [...new Set(places.map((p) => p.projectId))]
  const workspaceIds = [...new Set(places.flatMap((p) => (p.workspaceId ? [p.workspaceId] : [])))]
  const checks = await db.invitationChecks(organizationId, {
    projectIds,
    workspaceIds,
    emails,
    now: now.toISOString(),
  })
  if (checks.projects !== projectIds.length || checks.workspaces !== workspaceIds.length) {
    return c.json({ error: 'Not found' }, 404)
  }
  if (checks.members.length > 0) {
    return c.json(
      { error: `${checks.members[0]} is already in the organization`, field: 'emails' },
      409,
    )
  }
  if (checks.pending.length > 0) {
    return c.json({ error: `${checks.pending[0]} is already invited`, field: 'emails' }, 409)
  }
  if (!c.get('emailBudget')?.take(c.get('userId'), emails.length)) {
    return c.json({ error: TOO_MANY_EMAILS }, 429)
  }

  const created = emails.map((email) => ({
    id: nanoid(),
    organizationId,
    email,
    role: body.role,
    inviterId: c.get('userId'),
    expiresAt: expiresFrom(now),
    places: places.map((place) => ({ id: nanoid(), ...place })),
  }))
  await db.createInvitations(created)

  // The email names the org, the inviter and the first place, so one read
  // of the first invitation gives every card its words.
  const emails_ = c.get('emails')
  if (emails_) {
    const first = await db.getInvitation(created[0]!.id)
    if (first) {
      const details = inviteDetails(first)
      await Promise.all(
        created.map((invitation) =>
          emails_.sendInvitation({
            to: invitation.email,
            url: emails_.inviteUrl(invitation.id),
            orgName: details.org.name,
            inviterName: details.invitedBy.name,
            role: invitation.role,
            place: describePlace(first.places[0]),
            expiresAt: invitation.expiresAt,
          }),
        ),
      )
    }
  }
  return c.json({ data: created.map((i) => ({ id: i.id, email: i.email })) }, 201)
})

/** The invite page: which state it is in for the session that opened it. */
invitations.get('/:id', async (c) => {
  const view = await c.get('db').getInvitation(c.req.param('id'))
  return c.json(inviteViewRecord(view, viewerOf(c), new Date().toISOString()))
})

/** The invitation if it is the session's to answer, with its state; else the refusal. */
async function ownInvitation(c: Context<AppEnv>) {
  const view = await c.get('db').getInvitation(c.req.param('id') ?? '')
  const state = inviteViewRecord(view, viewerOf(c), new Date().toISOString())
  return { view, state }
}

/** Accept: join the org with the invite's role and places; lands where the first place is. */
invitations.post('/:id/accept', async (c) => {
  const { view, state } = await ownInvitation(c)
  if (state.state === 'gone' || !view)
    return c.json({ error: 'This invite is no longer open' }, 404)
  if (state.state === 'wrong-account') {
    return c.json({ error: `This invite is for ${state.invite.email}` }, 403)
  }
  if (state.state === 'expired') return c.json({ error: 'This invite has expired' }, 410)
  if (state.state === 'declined')
    return c.json({ error: 'You declined this invite. Undo first' }, 409)
  const db = c.get('db')
  const accept = () =>
    db.acceptInvitation({
      invitationId: view.invitation.id,
      userId: c.get('userId'),
      memberId: nanoid(),
      now: new Date().toISOString(),
    })
  // Every write of the unit is conditional on the invite being open now. A
  // member row written meanwhile (two accepts at once) meets the index on
  // this one's; accepting again then finds it and applies the rest.
  await accept().catch((error: unknown) => {
    if (!isUniqueViolation(error)) throw error
    return accept()
  })
  return c.json(inviteLanding(view))
})

invitations.post('/:id/decline', async (c) => {
  const { view, state } = await ownInvitation(c)
  if (state.state === 'gone' || !view)
    return c.json({ error: 'This invite is no longer open' }, 404)
  if (state.state === 'wrong-account') {
    return c.json({ error: `This invite is for ${state.invite.email}` }, 403)
  }
  if (state.state === 'expired') return c.json({ error: 'This invite has expired' }, 410)
  if (state.state === 'open')
    await c.get('db').setInvitationStatus(view.invitation.id, 'pending', 'rejected')
  return c.json({ ok: true })
})

invitations.post('/:id/undo-decline', async (c) => {
  const { view, state } = await ownInvitation(c)
  if (state.state === 'gone' || !view)
    return c.json({ error: 'This invite is no longer open' }, 404)
  if (state.state === 'wrong-account') {
    return c.json({ error: `This invite is for ${state.invite.email}` }, 403)
  }
  if (state.state === 'expired') return c.json({ error: 'This invite has expired' }, 410)
  if (state.state === 'declined')
    await c.get('db').setInvitationStatus(view.invitation.id, 'rejected', 'pending')
  return c.json({ ok: true })
})

/** After it expired: ask the inviter for a new one, once. */
invitations.post('/:id/ask-again', async (c) => {
  const { view, state } = await ownInvitation(c)
  if (state.state === 'gone' || !view)
    return c.json({ error: 'This invite is no longer open' }, 404)
  if (state.state === 'wrong-account') {
    return c.json({ error: `This invite is for ${state.invite.email}` }, 403)
  }
  if (state.state !== 'expired') return c.json({ error: 'This invite is still open' }, 409)
  const asked = await c.get('db').askForNewInvitation(view.invitation.id, new Date().toISOString())
  const emails = c.get('emails')
  if (asked && emails) {
    await emails.sendInviteRequest({
      to: view.inviter.email,
      url: emails.membersUrl(view.org.slug),
      orgName: view.org.name,
      askerEmail: view.invitation.email,
    })
  }
  return c.json({ ok: true, asked })
})

/**
 * Resend (owners and admins of the org): a fresh week, and the email again
 * — once per ten minutes per invitation, and within the sender's email
 * budget, so one address is never streamed mail.
 */
invitations.post('/:id/resend', async (c) => {
  const db = c.get('db')
  const now = new Date()
  const expiresAt = expiresFrom(now)
  const view = await db.getInvitation(c.req.param('id'))
  if (!view || view.invitation.organizationId !== c.get('organizationId')) {
    return c.json({ error: 'Not found' }, 404)
  }
  if (!c.get('emailBudget')?.take(c.get('userId'), 1)) {
    return c.json({ error: TOO_MANY_EMAILS }, 429)
  }
  const floor = expiresFrom(new Date(now.getTime() - RESEND_FLOOR_MS))
  if (!(await db.resendInvitation(view.invitation.id, expiresAt, floor))) {
    if (view.invitation.status === 'pending' && view.invitation.expiresAt > floor) {
      return c.json({ error: 'This invite was sent less than ten minutes ago' }, 429)
    }
    return c.json({ error: 'This invite is no longer open' }, 409)
  }
  const emails = c.get('emails')
  if (emails) {
    await emails.sendInvitation({
      to: view.invitation.email,
      url: emails.inviteUrl(view.invitation.id),
      orgName: view.org.name,
      inviterName: view.inviter.name,
      role: view.invitation.role ?? 'member',
      place: describePlace(view.places[0]),
      expiresAt,
    })
  }
  return c.json({ ok: true, expiresAt })
})

/**
 * Cancel (owners and admins): an open or declined invite's row stays as
 * `canceled`, the link stops working. One already answered or cancelled is
 * `409`; one read, only then, tells that from an invite not in this org.
 */
invitations.delete('/:id', async (c) => {
  const db = c.get('db')
  const id = c.req.param('id')
  const organizationId = c.get('organizationId')
  if (await db.cancelInvitation(id, organizationId)) return c.json({ ok: true })
  const view = await db.getInvitation(id)
  if (!view || view.invitation.organizationId !== organizationId) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json({ error: 'This invite is no longer open' }, 409)
})

/** `GET /me/invitations`: the open invitations waiting for the session's address. */
export const myInvitations = new Hono<AppEnv>()

myInvitations.get('/', async (c) => {
  // An unverified address proves nothing: it is told of no invitation.
  const viewer = viewerOf(c)
  if (!viewer.email || !viewer.emailVerified) return c.json({ data: [] })
  const rows = await c.get('db').listInvitationsForEmail(viewer.email, new Date().toISOString())
  return c.json({ data: rows.map(pendingInviteRecord) })
})
