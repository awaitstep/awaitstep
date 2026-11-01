import type { Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { grantCounts, inheritedWorkspaceRole } from '@awaitstep/ir'
import { describePlace, inviteDetails } from './access-records.js'
import { recordAudit } from './audit.js'
import type { AppEnv } from '../types.js'

// Sending invitations, wherever they are sent from: the org's Members page
// (`POST /invitations`), a project's (`POST /projects/:id/invitations`) or a
// workspace's (`POST /workspaces/:id/invitations`). The routes decide who may
// send and which places they may name; this checks and sends.

export const INVITE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const TOO_MANY_EMAILS = 'Too many invitation emails sent in the last hour. Try again later'

export const inviteEmailsSchema = z.array(z.string().trim().min(3).max(254)).min(1).max(20)

export const placeSchema = z.object({
  projectId: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  role: z.enum(['admin', 'member', 'editor', 'viewer']),
})

export type Place = z.infer<typeof placeSchema>

/** When an invitation sent (or resent) at `now` stops working. */
export function expiresFrom(now: Date): string {
  return new Date(now.getTime() + INVITE_DAYS * DAY_MS).toISOString()
}

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

export interface InvitationsToSend {
  emails: string[]
  role: 'member' | 'admin'
  places: Place[]
  /** Set when sent from a project or a workspace: every workspace place must be this project's. */
  inProject?: string
  /** Where it was sent from, so the audit row sits at that level too. */
  at?: { projectId: string; workspaceId: string | null }
  /**
   * Sent by a project or workspace admin, who can't see the org's invitation
   * list: an address already invited is skipped as if sent (it is invited),
   * so the answer can't be used to learn who the org has invited.
   */
  hidePending?: boolean
}

/** One pending invitation per address, each audited and emailed: the response the route returns. */
export async function sendInvitations(c: Context<AppEnv>, input: InvitationsToSend) {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
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
  const places = input.role === 'member' ? input.places : []
  const problem = placesProblem(places)
  if (problem) {
    return c.json(
      { error: 'Validation failed', details: [{ path: 'places', message: problem }] },
      422,
    )
  }

  // One read of every check: the places' ids are the organization's (and
  // the project's, when sent from one), and no address is already in it or
  // already invited.
  const now = new Date()
  const projectIds = [...new Set(places.map((p) => p.projectId))]
  const workspaceIds = [...new Set(places.flatMap((p) => (p.workspaceId ? [p.workspaceId] : [])))]
  const checks = await db.invitationChecks(organizationId, {
    projectIds,
    workspaceIds,
    emails,
    now: now.toISOString(),
    inProject: input.inProject,
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
  if (checks.pending.length > 0 && !input.hidePending) {
    return c.json({ error: `${checks.pending[0]} is already invited`, field: 'emails' }, 409)
  }
  // A caller who mustn't learn who is invited spends budget on every address and
  // gets the same answer either way, so neither the budget nor the reply tells.
  if (!c.get('emailBudget')?.take(c.get('userId'), emails.length)) {
    return c.json({ error: TOO_MANY_EMAILS }, 429)
  }
  const pending = new Set(checks.pending)
  const fresh = emails.filter((email) => !pending.has(email))

  const created = fresh.map((email) => ({
    id: nanoid(),
    organizationId,
    email,
    role: input.role,
    inviterId: c.get('userId'),
    expiresAt: expiresFrom(now),
    places: places.map((place) => ({ id: nanoid(), ...place })),
  }))
  await db.createInvitations(created)
  if (created.length > 0)
    await recordAudit(
      c,
      ...created.map((invitation) => ({
        event: 'invitation.create' as const,
        facts: { name: invitation.email, role: invitation.role },
        ...input.at,
      })),
    )

  // The email names the org, the inviter and the first place, so one read
  // of the first invitation gives every card its words.
  const sender = c.get('emails')
  if (sender && created.length > 0) {
    const first = await db.getInvitation(created[0]!.id)
    if (first) {
      const details = inviteDetails(first)
      await Promise.all(
        created.map((invitation) =>
          sender.sendInvitation({
            to: invitation.email,
            url: sender.inviteUrl(invitation.id),
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
  if (input.hidePending) {
    // Every address answers alike; ids are for those who manage invitations.
    return c.json({ data: emails.map((email) => ({ email })) }, 201)
  }
  return c.json(
    { data: created.map((i) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt })) },
    201,
  )
}
