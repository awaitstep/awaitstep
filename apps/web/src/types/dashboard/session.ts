// Dashboard types for the signed-in person and their organizations. Web-only
// until the backend phase moves them into their package (W1 brief, §D).

import type { OrgRole, ProjectRole, WorkspaceRole } from '@awaitstep/ir'

export type { OrgRole } from '@awaitstep/ir'

export interface Person {
  id: string
  name: string
  email: string
  initials: string
  /** An uploaded photo (data URL), shown instead of the initials. */
  image: string | null
}

/** The signed-in person, plus the organization they opened last. */
export interface Viewer extends Person {
  lastOrgSlug: string | null
}

export interface OrgSummary {
  id: string
  slug: string
  name: string
  initial: string
  /** An uploaded logo (data URL), shown instead of the initial. */
  logo: string | null
  role: OrgRole
  projectCount: number
  memberCount: number
  /** When this browser (or the dummy session) last opened it; null when it never did. */
  lastOpenedAt: string | null
}

/** An org on your list (`useOrgs`): the summary plus what /dashboard's card shows. */
export interface OrgListing extends OrgSummary {
  /** Your own roles there, oldest first; empty for an owner or admin, who see everything. */
  grants: OrgGrants
  /** Over the workspaces you can open: "1 failing · 5m ago", "All passing · 1d ago". */
  health: { failing: number; lastRunAt: string | null }
}

export interface OrgGrants {
  projects: { name: string; role: ProjectRole }[]
  workspaces: { name: string; projectName: string; role: WorkspaceRole }[]
}
