import type { PendingInvite } from '../../types/dashboard/invites'
import type { OrgListing, OrgRole } from '../../types/dashboard/session'
import { ORG_ROLE_LABEL } from '../access/parts/access-draft'
import { shortDay } from '../invites/invite-format'

// What /dashboard's org cards and invite rows say (D-DB-2), from the records
// the hooks return. Copy only: the API has already decided grants and health.

/** How many grant chips a member's card shows before "+N more". */
const GRANT_CHIPS = 2

const SHORT_ROLE: Record<string, string> = {
  admin: 'Admin',
  member: 'Member',
  editor: 'Editor',
  viewer: 'Viewer',
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function isOrgAdmin(role: OrgRole): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * Remembered orgs first, most recently opened first, then the rest by name.
 * `lastOpenedAt` is the browser's memory (or the dummy session's).
 */
export function orderOrgs(orgs: OrgListing[]): OrgListing[] {
  return [...orgs].sort((a, b) => {
    if (a.lastOpenedAt && b.lastOpenedAt) return b.lastOpenedAt.localeCompare(a.lastOpenedAt)
    if (a.lastOpenedAt) return -1
    if (b.lastOpenedAt) return 1
    return a.name.localeCompare(b.name)
  })
}

/** Orgs whose name contains the query, ignoring case. */
export function filterOrgs(orgs: OrgListing[], query: string): OrgListing[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return orgs
  return orgs.filter((org) => org.name.toLowerCase().includes(needle))
}

/**
 * The card's chips. Owners and admins: the project count, then "Just you" or
 * the people count. Members: the projects they can open, then their own
 * grants ("Sales · Editor"), two at most, then "+N more".
 */
export function orgChips(org: OrgListing): string[] {
  if (isOrgAdmin(org.role)) {
    return [
      plural(org.projectCount, 'project', 'projects'),
      org.memberCount <= 1 ? 'Just you' : plural(org.memberCount, 'person', 'people'),
    ]
  }
  const projects =
    org.projectCount === 0
      ? 'No projects you can open yet'
      : `${plural(org.projectCount, 'project', 'projects')} you can open`
  const grants = [
    ...org.grants.workspaces.map((grant) => `${grant.name} · ${SHORT_ROLE[grant.role]}`),
    ...org.grants.projects.map((grant) => `${grant.name} · ${SHORT_ROLE[grant.role]}`),
  ]
  const extra = grants.length - GRANT_CHIPS
  return [projects, ...grants.slice(0, GRANT_CHIPS), ...(extra > 0 ? [`+${extra} more`] : [])]
}

/** "Member · Platform workspace · expires 4 Nov" under an invite waiting for you. */
export function inviteMeta(invite: PendingInvite): string {
  const parts = [ORG_ROLE_LABEL[invite.orgRole]]
  if (invite.place) {
    parts.push(
      invite.place.kind === 'workspace' ? `${invite.place.name} workspace` : invite.place.name,
    )
  }
  parts.push(`expires ${shortDay(invite.expiresAt)}`)
  return parts.join(' · ')
}
