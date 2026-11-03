import { createContext, useContext } from 'react'
import { useOrgStore, type Organization } from '../../stores/org-store'
import { recentOrgs } from './scope-memory'

// Org-less dashboard pages (your account, the API Playground) carry no org in
// their URL, but the dashboard frame still needs one for the rail: which
// organization's projects, settings and inbox the rail links to. That is the
// "current" org — the one you were last in — resolved the same way a legacy
// redirect picks where to land.

/**
 * The org whose rail frames an org-less page: the most recently opened one you
 * can still open, else the active one, else the first; `null` with no org at all.
 */
export function pickCurrentOrg(
  orgs: readonly Organization[],
  activeOrganizationId: string | null,
  recent: readonly string[],
): Organization | null {
  if (orgs.length === 0) return null
  const bySlug = new Map(orgs.map((org) => [org.slug, org]))
  for (const slug of recent) {
    const found = bySlug.get(slug)
    if (found) return found
  }
  return orgs.find((org) => org.id === activeOrganizationId) ?? orgs[0]
}

/** Resolves the current org from the store and recent-org memory; `null` with none. */
export function useCurrentOrg(): Organization | null {
  const organizations = useOrgStore((s) => s.organizations)
  const activeOrganizationId = useOrgStore((s) => s.activeOrganizationId)
  return pickCurrentOrg(organizations, activeOrganizationId, recentOrgs())
}

const CurrentOrgContext = createContext<Organization | null>(null)

export const CurrentOrgProvider = CurrentOrgContext.Provider

/**
 * The org framing the current org-less page. Throws outside the org-less
 * layout, which resolves the org (or redirects to /dashboard) before rendering.
 */
export function useBorrowedOrg(): Organization {
  const org = useContext(CurrentOrgContext)
  if (!org) throw new Error('useBorrowedOrg must be used within the org-less layout')
  return org
}
