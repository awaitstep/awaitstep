import { isOrgAdmin, type OrgRole, type ProjectRole, type WorkspaceRole } from '@awaitstep/ir'
import type {
  AccessRequestRow,
  InvitationPlaceRow,
  InvitationRow,
  InvitationView,
  OrgMemberRow,
  PendingInvitationRow,
  PersonAccessRows,
  ProjectMemberRow,
  WorkspaceChip,
} from '@awaitstep/db'
import { parseOrgRole } from './org-role.js'

// What the people pages, the access editor, the invite pages and a Viewer's
// request read: the adapter's rows shaped the way the dashboard draws them.

export interface PersonRecord {
  id: string
  name: string
  /** Left out for a viewer who is not an org owner or admin. */
  email?: string
  image: string | null
}

function personRecord(
  row: { id: string; name: string; email: string; image: string | null },
  withEmail: boolean,
): PersonRecord {
  return {
    id: row.id,
    name: row.name,
    ...(withEmail ? { email: row.email } : {}),
    image: row.image,
  }
}

/** One place an org member can work: a project-wide role, or a role in one workspace. */
export interface AccessPlaceRecord {
  project: { id: string; name: string; workspaceCount: number }
  workspace: { id: string; name: string } | null
  role: ProjectRole | WorkspaceRole
}

export interface OrgMemberRecord extends PersonRecord {
  role: OrgRole
  joinedAt: string
  /** Empty for owners and admins, who open every project. */
  places: AccessPlaceRecord[]
}

export function orgMemberRecord(
  row: OrgMemberRow,
  withEmail: boolean,
  viewerId: string,
): OrgMemberRecord {
  const role = parseOrgRole(row.role)
  return {
    ...personRecord(row, withEmail || row.id === viewerId),
    role,
    joinedAt: row.joinedAt,
    places: isOrgAdmin(role)
      ? []
      : row.places.map((place) => ({
          project: {
            id: place.projectId,
            name: place.projectName,
            workspaceCount: place.workspaceCount,
          },
          workspace:
            place.workspaceId && place.workspaceName
              ? { id: place.workspaceId, name: place.workspaceName }
              : null,
          role: place.role as ProjectRole | WorkspaceRole,
        })),
  }
}

/** What the access editor loads for one person: every project in the org and their roles. */
export interface PersonAccessRecord {
  person: PersonRecord
  joinedAt: string
  orgRole: OrgRole
  projects: { id: string; name: string; workspaces: WorkspaceChip[] }[]
  projectRoles: Record<string, ProjectRole>
  workspaceRoles: Record<string, WorkspaceRole>
}

export function personAccessRecord(rows: PersonAccessRows): PersonAccessRecord {
  return {
    person: rows.person,
    joinedAt: rows.joinedAt,
    orgRole: parseOrgRole(rows.role),
    projects: rows.projects,
    projectRoles: Object.fromEntries(rows.projectGrants.map((g) => [g.projectId, g.role])),
    workspaceRoles: Object.fromEntries(rows.workspaceGrants.map((g) => [g.workspaceId, g.role])),
  }
}

/** How someone reaches every workspace in a project. */
export type ProjectWideRole = 'owner' | 'org-admin' | 'project-admin' | 'project-member'

/** Project settings → Members, in the board's two groups. */
export interface ProjectMembersRecord {
  wholeProject: { person: PersonRecord; role: ProjectWideRole }[]
  workspacesOnly: {
    person: PersonRecord
    workspaces: { workspace: WorkspaceChip; role: WorkspaceRole }[]
  }[]
}

function wideRole(row: ProjectMemberRow): ProjectWideRole | null {
  const orgRole = parseOrgRole(row.orgRole)
  if (orgRole === 'owner') return 'owner'
  if (orgRole === 'admin') return 'org-admin'
  if (row.projectGrant === 'admin') return 'project-admin'
  if (row.projectGrant === 'member') return 'project-member'
  return null
}

export function projectMembersRecord(
  rows: ProjectMemberRow[],
  withEmail: boolean,
  viewerId: string,
): ProjectMembersRecord {
  const record: ProjectMembersRecord = { wholeProject: [], workspacesOnly: [] }
  for (const row of rows) {
    const person = personRecord(row, withEmail || row.id === viewerId)
    const role = wideRole(row)
    if (role) {
      record.wholeProject.push({ person, role })
    } else if (row.workspaces.length > 0) {
      record.workspacesOnly.push({
        person,
        workspaces: row.workspaces.map(({ role, ...workspace }) => ({ workspace, role })),
      })
    }
  }
  return record
}

export interface InvitationPlaceRecord {
  kind: 'project' | 'workspace'
  project: string
  workspace: string | null
  role: ProjectRole | WorkspaceRole
}

function placeRecord(place: InvitationPlaceRow): InvitationPlaceRecord {
  return {
    kind: place.workspaceId ? 'workspace' : 'project',
    project: place.projectName,
    workspace: place.workspaceName,
    role: place.role as ProjectRole | WorkspaceRole,
  }
}

/** A pending invitation as Org Members lists it. */
export interface InvitationRecord {
  id: string
  email: string
  role: OrgRole
  places: InvitationPlaceRecord[]
  sentAt: string
  expiresAt: string
  invitedBy: { id: string; name: string }
  askedForNewAt: string | null
}

export function invitationRecord(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    email: row.email,
    role: parseOrgRole(row.role),
    places: row.places.map(placeRecord),
    sentAt: row.createdAt,
    expiresAt: row.expiresAt,
    invitedBy: row.inviter,
    askedForNewAt: row.askedForNewAt,
  }
}

/** Where an invite leads first, as the Accept page shows it. */
export type InvitePlaceRecord =
  | { kind: 'workspace'; name: string; projectName: string; role: WorkspaceRole }
  | { kind: 'project'; name: string; role: ProjectRole }

export interface InviteDetailsRecord {
  token: string
  org: { name: string; slug: string; logo: string | null }
  invitedBy: PersonRecord
  email: string
  orgRole: OrgRole
  /** The first place; null for an owner or admin, who see everything. */
  place: InvitePlaceRecord | null
  sentAt: string
  expiresAt: string
}

/** What the invite page shows, worked out from the invitation and who opened it. */
export type InviteViewRecord =
  | { state: 'open'; invite: InviteDetailsRecord; viewerEmail: string }
  | { state: 'declined'; invite: InviteDetailsRecord; viewerEmail: string }
  | { state: 'wrong-account'; invite: InviteDetailsRecord; viewerEmail: string }
  | { state: 'expired'; invite: InviteDetailsRecord; askedForNew: boolean }
  | { state: 'gone' }

/** The place an invite leads first; null when it has none (an owner or admin invite). */
function firstPlace(places: InvitationPlaceRow[]): InvitePlaceRecord | null {
  const first = places[0]
  if (!first) return null
  return first.workspaceId && first.workspaceName
    ? {
        kind: 'workspace',
        name: first.workspaceName,
        projectName: first.projectName,
        role: first.role as WorkspaceRole,
      }
    : { kind: 'project', name: first.projectName, role: first.role as ProjectRole }
}

export function inviteDetails(view: InvitationView): InviteDetailsRecord {
  const place = firstPlace(view.places)
  return {
    token: view.invitation.id,
    org: { name: view.org.name, slug: view.org.slug, logo: view.org.logo },
    invitedBy: view.inviter,
    email: view.invitation.email,
    orgRole: parseOrgRole(view.invitation.role),
    place,
    sentAt: view.invitation.createdAt,
    expiresAt: view.invitation.expiresAt,
  }
}

/** The session that opened an invite: its address, and whether that address is proven theirs. */
export interface InviteViewer {
  email: string
  emailVerified: boolean
}

/**
 * The invite page's state for the person who opened it: the wrong account
 * first (someone else sees the card, without its place, the inviter's
 * address or any action), then expired, then open or declined. Accepted and
 * cancelled ones are gone. An address the session has not verified (a
 * social sign-in can carry one) is someone else's for this purpose: the
 * invitation is claimed on the address alone.
 */
export function inviteViewRecord(
  view: InvitationView | null,
  viewer: InviteViewer,
  now: string,
): InviteViewRecord {
  if (!view) return { state: 'gone' }
  const { invitation } = view
  if (invitation.status !== 'pending' && invitation.status !== 'rejected') return { state: 'gone' }
  const invite = inviteDetails(view)
  const email = viewer.email.toLowerCase()
  if (!viewer.emailVerified || email !== invitation.email.toLowerCase()) {
    return {
      state: 'wrong-account',
      invite: { ...invite, place: null, invitedBy: { ...invite.invitedBy, email: '' } },
      viewerEmail: email,
    }
  }
  if (invitation.expiresAt <= now) {
    return { state: 'expired', invite, askedForNew: invitation.askedForNewAt !== null }
  }
  if (invitation.status === 'rejected') return { state: 'declined', invite, viewerEmail: email }
  return { state: 'open', invite, viewerEmail: email }
}

/** Where accepting lands: the first place's workspace or project, else the org's Projects. */
export function inviteLanding(view: InvitationView): {
  org: string
  project?: string
  workspace?: string
} {
  const first = view.places[0]
  if (!first) return { org: view.org.slug }
  if (first.workspaceSlug) {
    return { org: view.org.slug, project: first.projectSlug, workspace: first.workspaceSlug }
  }
  return { org: view.org.slug, project: first.projectSlug }
}

/** An invite waiting for the viewer, for /dashboard's "Waiting for you". */
export interface PendingInviteRecord {
  token: string
  org: { name: string; slug: string; logo: string | null }
  invitedBy: string
  orgRole: OrgRole
  /** Where it leads first, as the invite page names it; null for an owner or admin invite. */
  place: InvitePlaceRecord | null
  expiresAt: string
}

export function pendingInviteRecord(row: PendingInvitationRow): PendingInviteRecord {
  return {
    token: row.id,
    org: row.org,
    invitedBy: row.inviterName,
    orgRole: parseOrgRole(row.role),
    place: firstPlace(row.places),
    expiresAt: row.expiresAt,
  }
}

/** A Viewer's ask for edit access, as the top bar's "Asked Ama" reads it. */
export interface AccessRequestRecord {
  id: string
  workspaceId: string
  from: { id: string; name: string }
  to: { id: string; name: string }
  status: AccessRequestRow['status']
  at: string
}

export function accessRequestRecord(row: AccessRequestRow): AccessRequestRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    from: row.from,
    to: row.to,
    status: row.status,
    at: row.createdAt,
  }
}

/** "Sales in Project 101 (Editor)", for an invitation email. */
export function describePlace(place: InvitationPlaceRow | undefined): string | null {
  if (!place) return null
  const role = place.role.charAt(0).toUpperCase() + place.role.slice(1)
  return place.workspaceName
    ? `${place.workspaceName} in ${place.projectName} (${role})`
    : `${place.projectName} (Project ${role})`
}
