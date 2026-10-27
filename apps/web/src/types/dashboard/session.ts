// Dashboard types for the signed-in person and their organizations. Web-only
// until the backend phase moves them into their package (W1 brief, §D).

export type OrgRole = 'owner' | 'admin' | 'member'

export interface Person {
  id: string
  name: string
  email: string
  initials: string
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
  lastOpenedAt: string | null
}
