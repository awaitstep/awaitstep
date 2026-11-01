import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { isUniqueViolation, type InvitationView } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import {
  describePlace,
  inviteLanding,
  inviteViewRecord,
  invitationRecord,
  pendingInviteRecord,
} from '../lib/access-records.js'
import { recordAudit } from '../lib/audit.js'
import {
  TOO_MANY_EMAILS,
  expiresFrom,
  inviteEmailsSchema,
  placeSchema,
  sendInvitations,
} from '../lib/send-invitations.js'
import { clearNotice, noticeGroup, notify } from '../lib/notify.js'
import type { AppEnv } from '../types.js'

/** One resend per invitation per this long: the email again, not a stream of them. */
export const RESEND_FLOOR_MS = 10 * 60 * 1000

const sendSchema = z.object({
  emails: inviteEmailsSchema,
  role: z.enum(['member', 'admin']),
  places: z.array(placeSchema).max(100).default([]),
})

/** The session's address and whether it is proven: an invite is claimed on the address alone. */
function viewerOf(c: Context<AppEnv>) {
  const user = c.get('user')
  return { email: user?.email ?? '', emailVerified: user?.emailVerified === true }
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

/** Invite people into the organization: owners and admins, any places. */
invitations.post('/', zValidator('json', sendSchema), (c) =>
  sendInvitations(c, c.req.valid('json')),
)

/** The inviter hears how their invite was answered, in the invite's organization. */
function tellInviter(
  c: Context<AppEnv>,
  view: InvitationView,
  event: 'invitation.accept' | 'invitation.decline' | 'invitation.ask_again',
) {
  return notify(c, {
    event,
    organizationId: view.invitation.organizationId,
    groupKey: noticeGroup.invitation(event, view.invitation.id),
    meta: { email: view.invitation.email, person: c.get('user')?.name || undefined },
    recipients: { users: [view.inviter.id] },
  })
}

/** Takes back what an answer told the inviter: an undone decline, an answered ask. */
function clearInviterNotice(
  c: Context<AppEnv>,
  view: InvitationView,
  event: 'invitation.decline' | 'invitation.ask_again',
) {
  return clearNotice(
    c.get('db'),
    view.invitation.organizationId,
    noticeGroup.invitation(event, view.invitation.id),
  )
}

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
  // Joining is the step a leaked invite link would be used for.
  await recordAudit(c, {
    event: 'member.join',
    facts: { name: view.org.name, role: view.invitation.role ?? undefined },
    organizationId: view.invitation.organizationId,
  })
  await tellInviter(c, view, 'invitation.accept')
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
  if (
    state.state === 'open' &&
    (await c.get('db').setInvitationStatus(view.invitation.id, 'pending', 'rejected'))
  ) {
    await tellInviter(c, view, 'invitation.decline')
  }
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
  if (
    state.state === 'declined' &&
    (await c.get('db').setInvitationStatus(view.invitation.id, 'rejected', 'pending'))
  ) {
    await clearInviterNotice(c, view, 'invitation.decline')
  }
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
  if (asked) await tellInviter(c, view, 'invitation.ask_again')
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
  // Resending answers "asked for a new invite".
  await clearInviterNotice(c, view, 'invitation.ask_again')
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
  const email = await db.cancelInvitation(id, organizationId)
  if (email) {
    await recordAudit(c, { event: 'invitation.cancel', facts: { name: email } })
    // A cancelled invite has nothing left to ask about.
    await clearNotice(db, organizationId, noticeGroup.invitation('invitation.ask_again', id))
    return c.json({ ok: true })
  }
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
