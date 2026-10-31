import type { ProjectRole } from './projects'
import type { OrgRole } from './session'
import type { WorkspaceRole } from './workspaces'

// Dashboard types for opening an invite. Web-only until B2 sends real ones.

/** Where an invite leads first, as `AcceptInvite` shows it. */
export type InvitePlace =
  | { kind: 'workspace'; name: string; projectName: string; role: WorkspaceRole }
  | { kind: 'project'; name: string; role: ProjectRole }

export interface InviteDetails {
  /** Its token in the URL (`/invite/<token>`). */
  token: string
  org: { name: string; initial: string; logo: string | null }
  invitedBy: { id: string; name: string; email: string; initials: string; image: string | null }
  /** The address that can accept it. */
  email: string
  orgRole: OrgRole
  /** The first place it opens; null for an owner or admin, who see everything. */
  place: InvitePlace | null
  sentAt: string
  expiresAt: string
}

/** What the invite page shows, worked out from the invite and who opened it. */
export type InviteView =
  | { state: 'open'; invite: InviteDetails; viewerEmail: string }
  | { state: 'declined'; invite: InviteDetails; viewerEmail: string }
  | { state: 'wrong-account'; invite: InviteDetails; viewerEmail: string }
  | { state: 'expired'; invite: InviteDetails; askedForNew: boolean }
  | { state: 'gone' }

/** Where Accept lands: the invite's first workspace, or the org's Projects. */
export interface AcceptedInvite {
  org: string
  project?: string
  workspace?: string
}

/** An invite waiting for the viewer, for /dashboard's "Waiting for you". */
export interface PendingInvite {
  token: string
  org: { name: string; initial: string }
  invitedBy: string
  orgRole: OrgRole
  /** Where it leads first; null for an owner or admin invite. */
  place: InvitePlace | null
  expiresAt: string
}
