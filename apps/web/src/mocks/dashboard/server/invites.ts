import type {
  AcceptedInvite,
  InviteDetails,
  InvitePlace,
  InviteView,
  PendingInvite,
} from '../../../types/dashboard/invites'
import type { ProjectRole } from '../../../types/dashboard/projects'
import type { WorkspaceRole } from '../../../types/dashboard/workspaces'
import { getDb, type InvitationRow, type MockDb } from '../db'
import {
  type MockContext,
  conflictError,
  endpoint,
  invalidError,
  mutation,
  notFoundError,
} from '../scenario'
import { personById } from './records'

// Opening an invite (P9). Thin: the invitation's id is its token, and who
// opens it is the dummy session (`?as=`); real tokens and emails are B2.

const INVITE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function expiresAt(row: InvitationRow): string {
  return new Date(new Date(row.sentAt).getTime() + INVITE_DAYS * DAY_MS).toISOString()
}

function isExpired(row: InvitationRow): boolean {
  return expiresAt(row) <= new Date().toISOString()
}

function viewerEmail(db: MockDb, ctx: MockContext): string {
  return personById(db, ctx.userId).email.toLowerCase()
}

function firstPlace(db: MockDb, row: InvitationRow): InvitePlace | null {
  const place = row.places[0]
  const project = place && db.projects.find((p) => p.id === place.projectId)
  if (!place || !project) return null
  const workspace = place.workspaceId && db.workspaces.find((w) => w.id === place.workspaceId)
  if (workspace) {
    return {
      kind: 'workspace',
      name: workspace.name,
      projectName: project.name,
      role: place.role as WorkspaceRole,
    }
  }
  return { kind: 'project', name: project.name, role: place.role as ProjectRole }
}

function details(db: MockDb, row: InvitationRow): InviteDetails {
  const org = db.orgs.find((o) => o.id === row.orgId)!
  const inviter = personById(db, row.invitedBy)
  return {
    token: row.id,
    org: { name: org.name, initial: org.name.charAt(0).toUpperCase(), logo: org.logo },
    invitedBy: {
      id: inviter.id,
      name: inviter.name,
      email: inviter.email,
      initials: inviter.initials,
    },
    email: row.email,
    orgRole: row.role,
    place: firstPlace(db, row),
    sentAt: row.sentAt,
    expiresAt: expiresAt(row),
  }
}

/**
 * The invite page: the wrong account first (someone else sees neither its
 * details nor its actions), then expired, then open or declined (D-P9-3).
 */
export const getInvite = endpoint((ctx, token: string): InviteView => {
  const db = getDb()
  const row = db.invitations.find((i) => i.id === token)
  if (!row) return { state: 'gone' }
  const invite = details(db, row)
  const email = viewerEmail(db, ctx)
  if (email !== row.email.toLowerCase()) {
    return { state: 'wrong-account', invite, viewerEmail: email }
  }
  if (isExpired(row)) return { state: 'expired', invite, askedForNew: !!row.askedForNewAt }
  return { state: row.declined ? 'declined' : 'open', invite, viewerEmail: email }
})

/** The invite, if it is the viewer's to answer and still open. */
function ownOpenInvite(db: MockDb, ctx: MockContext, token: string): InvitationRow {
  const row = db.invitations.find((i) => i.id === token)
  if (!row) throw notFoundError()
  if (isExpired(row)) throw invalidError('This invite has expired')
  if (viewerEmail(db, ctx) !== row.email.toLowerCase()) {
    throw invalidError(`This invite is for ${row.email}`)
  }
  return row
}

/** A row in the inviter's Inbox about their invite. */
function tellInviter(
  db: MockDb,
  row: InvitationRow,
  notice: { id: string; title: string; needsAction: boolean },
) {
  db.notifications.push({
    id: notice.id,
    orgId: row.orgId,
    userId: row.invitedBy,
    kind: 'people',
    title: notice.title,
    projectId: null,
    workspaceId: null,
    whereDetail: 'Members',
    at: new Date().toISOString(),
    needsAction: notice.needsAction,
    link: { label: 'See members', to: { kind: 'org-settings', page: 'members' } },
  })
}

function declineNoticeId(row: InvitationRow): string {
  return `ntf_declined_${row.id}`
}

/** One per invite, so Resend in Org Members can clear it. */
export function askedNoticeId(invitationId: string): string {
  return `ntf_asked_${invitationId}`
}

/** Accept: joins the org with the invite's role and places; the invite goes (D-P9-5). */
export const acceptInvite = mutation((ctx, token: string): AcceptedInvite => {
  const db = getDb()
  const row = ownOpenInvite(db, ctx, token)
  if (row.declined) throw conflictError('You declined this invite. Undo first')
  const now = new Date().toISOString()
  if (!db.orgMembers.some((m) => m.orgId === row.orgId && m.userId === ctx.userId)) {
    db.orgMembers.push({
      orgId: row.orgId,
      userId: ctx.userId,
      role: row.role,
      joinedAt: now,
      lastOpenedAt: null,
    })
  }
  for (const place of row.places) {
    if (place.workspaceId) {
      const grant = { workspaceId: place.workspaceId, userId: ctx.userId }
      db.workspaceMembers = db.workspaceMembers.filter(
        (m) => !(m.workspaceId === grant.workspaceId && m.userId === grant.userId),
      )
      db.workspaceMembers.push({ ...grant, role: place.role as WorkspaceRole })
    } else {
      db.projectMembers = db.projectMembers.filter(
        (m) => !(m.projectId === place.projectId && m.userId === ctx.userId),
      )
      db.projectMembers.push({
        projectId: place.projectId,
        userId: ctx.userId,
        role: place.role as ProjectRole,
      })
    }
  }
  db.invitations = db.invitations.filter((i) => i.id !== row.id)
  const org = db.orgs.find((o) => o.id === row.orgId)!
  const first = row.places[0]
  const project = first && db.projects.find((p) => p.id === first.projectId)
  const workspace = first?.workspaceId
    ? db.workspaces.find((w) => w.id === first.workspaceId)
    : undefined
  return { org: org.slug, project: project?.slug, workspace: workspace?.slug }
})

/** Decline: the inviter hears about it; Undo takes both back (D-P9-6). */
export const declineInvite = mutation((ctx, token: string): void => {
  const db = getDb()
  const row = ownOpenInvite(db, ctx, token)
  if (row.declined) return
  row.declined = true
  const name = personById(db, ctx.userId).name
  const org = db.orgs.find((o) => o.id === row.orgId)!
  tellInviter(db, row, {
    id: declineNoticeId(row),
    title: `${name} declined your invite to ${org.name}`,
    needsAction: false,
  })
})

export const undoDeclineInvite = mutation((ctx, token: string): void => {
  const db = getDb()
  const row = ownOpenInvite(db, ctx, token)
  row.declined = false
  db.notifications = db.notifications.filter((n) => n.id !== declineNoticeId(row))
})

/** After it expires: ask the inviter for a new one, once (D-P9-7). */
export const askForNewInvite = mutation((ctx, token: string): void => {
  const db = getDb()
  const row = db.invitations.find((i) => i.id === token)
  if (!row) throw notFoundError()
  if (!isExpired(row)) throw invalidError('This invite is still open')
  if (viewerEmail(db, ctx) !== row.email.toLowerCase()) {
    throw invalidError(`This invite is for ${row.email}`)
  }
  if (row.askedForNewAt) return
  row.askedForNewAt = new Date().toISOString()
  const name = personById(db, ctx.userId).name
  const org = db.orgs.find((o) => o.id === row.orgId)!
  // Resend in Org Members answers it.
  tellInviter(db, row, {
    id: askedNoticeId(row.id),
    title: `${name} asked for a new invite to ${org.name}`,
    needsAction: true,
  })
})

/** Invites waiting for the viewer, for Choose an organization. */
export const listMyInvites = endpoint((ctx): PendingInvite[] => {
  const db = getDb()
  const email = viewerEmail(db, ctx)
  return db.invitations
    .filter((i) => i.email.toLowerCase() === email && !i.declined && !isExpired(i))
    .map((row) => {
      const org = db.orgs.find((o) => o.id === row.orgId)!
      return {
        token: row.id,
        org: { name: org.name, initial: org.name.charAt(0).toUpperCase() },
        invitedBy: personById(db, row.invitedBy).name,
        orgRole: row.role,
      }
    })
})
