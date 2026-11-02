import type { ConnectionTokenStatus } from '@awaitstep/ir'
import type { AccessDraft, AccessProject } from './access'
import type { ProjectRole } from './projects'
import type { OrgRole, Person } from './session'
import type { WorkspaceRole } from './workspaces'

// Dashboard types for org settings: members, invitations, connections.
// Web-only until B2 (access, invites) and B9 (connections) move them.

/** One place someone can work, for the Members page's "Has access to" column. */
export interface AccessPlace {
  project: { id: string; name: string; workspaceCount: number }
  /** Null for a whole-project role. */
  workspace: { id: string; name: string } | null
  role: ProjectRole | WorkspaceRole
}

/** A row on org Settings → Members. */
export interface OrgMember {
  person: Person
  role: OrgRole
  /** Empty for owners and admins, who open every project. */
  places: AccessPlace[]
}

/** What the access editor loads for one person: every project in the org and their roles. */
export interface PersonAccess {
  person: Person
  joinedAt: string
  projects: AccessProject[]
  draft: AccessDraft
}

/** A pending invitation. */
export interface Invitation {
  id: string
  email: string
  role: OrgRole
  /** Only places in projects the viewer can open, and that still exist. */
  places: (
    | { kind: 'project'; project: string; workspace: null; role: ProjectRole | WorkspaceRole }
    | { kind: 'workspace'; project: string; workspace: string; role: ProjectRole | WorkspaceRole }
  )[]
  sentAt: string
  invitedBy: { id: string; name: string }
}

export interface NewInvitesInput {
  emails: string[]
  role: Exclude<OrgRole, 'owner'>
  places: { projectId: string; workspaceId: string | null; role: ProjectRole | WorkspaceRole }[]
}

/** A Cloudflare account AwaitStep deploys to. */
export interface Connection {
  id: string
  name: string
  /** The account ID's last four characters: "7f2a". */
  accountSuffix: string
  addedBy: { id: string; name: string }
  /** What Cloudflare last said: `unchecked` until the first check (a connection older than B9). */
  tokenStatus: ConnectionTokenStatus
  /** When the token stops working; null for no expiry. */
  tokenExpiresAt: string | null
  /** `all`: every project, including new ones. Only the projects the viewer can see are named. */
  projects: 'all' | { id: string; name: string }[]
  /** Projects on its list the viewer can't see (only an org owner or admin sees them all). */
  hiddenProjects: number
  deployments: { count: number; lastAt: string | null }
}

export interface NewConnectionInput {
  name: string
  accountId: string
  token: string
  projects: 'all' | string[]
}

export interface OrgUpdate {
  name?: string
  slug?: string
  /** A picked logo to upload (`readLogo`), or null for the initial. */
  logo?: Blob | null
}
