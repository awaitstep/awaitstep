import type {
  ApiAccessRequest,
  ApiInviteDetails,
  ApiInviteView,
  ApiInvitation,
  ApiOrgMember,
  ApiPendingInvite,
  ApiPersonAccess,
  ApiProjectMembers,
  ApiWorkspacePerson,
} from '../../../lib/dashboard-api'
import { initialOf, initialsOf } from '../../../lib/initials'
import type { AccessGrant, EditRequest, ProjectMembers } from '../../../types/dashboard/access'
import type {
  AcceptedInvite,
  InviteDetails,
  InviteView,
  PendingInvite,
} from '../../../types/dashboard/invites'
import type {
  Invitation,
  NewInvitesInput,
  OrgMember,
  PersonAccess,
} from '../../../types/dashboard/org-settings'
import type { Person } from '../../../types/dashboard/session'
import type { WorkspacePerson } from '../../../types/dashboard/workspaces'

// API responses → the records the people pages, the access editor and the
// invite pages render. The API already resolved every role; this adds what
// the pages derive (initials, nesting) and nothing else.

function person(row: { id: string; name: string; email: string; image: string | null }): Person {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    initials: initialsOf(row.name, row.email),
    image: row.image,
  }
}

export function toWorkspacePerson(row: ApiWorkspacePerson): WorkspacePerson {
  return {
    person: person(row),
    role: row.role,
    inherited: row.inherited,
    lastActiveAt: row.lastActiveAt,
    projectRole: row.projectRole,
    orgRole: row.orgRole,
  }
}

export function toOrgMember(row: ApiOrgMember): OrgMember {
  return { person: person(row), role: row.role, places: row.places }
}

export function toPersonAccess(row: ApiPersonAccess): PersonAccess {
  return {
    person: person(row.person),
    joinedAt: row.joinedAt,
    projects: row.projects.map((project) => ({
      id: project.id,
      name: project.name,
      initial: initialOf(project.name),
      workspaces: project.workspaces,
    })),
    draft: {
      orgRole: row.orgRole,
      projects: { ...row.projectRoles },
      workspaces: { ...row.workspaceRoles },
    },
  }
}

/** What the editor saves, as the API takes it: the same shape. */
export function toAccessGrantBody(grant: AccessGrant): AccessGrant {
  return grant
}

export function toProjectMembers(row: ApiProjectMembers): ProjectMembers {
  return {
    wholeProject: row.wholeProject.map((m) => ({ person: person(m.person), role: m.role })),
    workspacesOnly: row.workspacesOnly.map((m) => ({
      person: person(m.person),
      workspaces: m.workspaces,
    })),
  }
}

export function toInvitation(row: ApiInvitation): Invitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    places: row.places.map((place) =>
      place.kind === 'workspace'
        ? {
            kind: 'workspace' as const,
            project: place.project,
            workspace: place.workspace ?? '',
            role: place.role,
          }
        : { kind: 'project' as const, project: place.project, workspace: null, role: place.role },
    ),
    sentAt: row.sentAt,
    invitedBy: row.invitedBy,
  }
}

/** The invite dialog's input, as the API takes it: the same shape. */
export function toInvitesBody(input: NewInvitesInput): NewInvitesInput {
  return input
}

function toInviteDetails(row: ApiInviteDetails): InviteDetails {
  return {
    token: row.token,
    org: { name: row.org.name, initial: initialOf(row.org.name), logo: row.org.logo },
    invitedBy: { ...person(row.invitedBy) },
    email: row.email,
    orgRole: row.orgRole,
    place: row.place,
    sentAt: row.sentAt,
    expiresAt: row.expiresAt,
  }
}

export function toInviteView(row: ApiInviteView): InviteView {
  switch (row.state) {
    case 'gone':
      return { state: 'gone' }
    case 'expired':
      return { state: 'expired', invite: toInviteDetails(row.invite), askedForNew: row.askedForNew }
    default:
      return { state: row.state, invite: toInviteDetails(row.invite), viewerEmail: row.viewerEmail }
  }
}

export function toAcceptedInvite(row: {
  org: string
  project?: string
  workspace?: string
}): AcceptedInvite {
  return row
}

export function toPendingInvite(row: ApiPendingInvite): PendingInvite {
  return {
    token: row.token,
    org: { name: row.org.name, initial: initialOf(row.org.name) },
    invitedBy: row.invitedBy,
    orgRole: row.orgRole,
    place: row.place,
    expiresAt: row.expiresAt,
  }
}

export function toEditRequest(row: ApiAccessRequest): EditRequest {
  return { id: row.id, workspaceId: row.workspaceId, from: row.from, to: row.to, at: row.at }
}
