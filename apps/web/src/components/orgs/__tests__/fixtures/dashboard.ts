import type { PendingInvite } from '../../../../types/dashboard/invites'
import type { OrgListing, Viewer } from '../../../../types/dashboard/session'

// The 17a board's sample: Daniel, a Member of Acme with Sales · Editor, and
// the owner of his own sandbox; Lena's Globex invite waiting for him.

export const DANIEL: Viewer = {
  id: 'u-daniel',
  name: 'Daniel Kim',
  email: 'daniel@acme.test',
  initials: 'DK',
  image: null,
  lastOrgSlug: 'acme',
}

export function orgListing(overrides: Partial<OrgListing> = {}): OrgListing {
  return {
    id: 'org-acme',
    slug: 'acme',
    name: 'Acme Inc',
    initial: 'A',
    logo: null,
    role: 'member',
    projectCount: 1,
    memberCount: 6,
    lastOpenedAt: '2026-10-31T10:00:00.000Z',
    grants: {
      projects: [],
      workspaces: [{ name: 'Sales', projectName: 'Project 101', role: 'editor' }],
    },
    health: { failing: 1, lastRunAt: '2026-10-31T11:55:00.000Z' },
    ...overrides,
  }
}

export const ACME = orgListing()

export const SANDBOX = orgListing({
  id: 'org-sandbox',
  slug: 'daniels-sandbox',
  name: 'Daniel’s sandbox',
  initial: 'D',
  role: 'owner',
  projectCount: 2,
  memberCount: 1,
  lastOpenedAt: '2026-10-28T12:00:00.000Z',
  grants: { projects: [], workspaces: [] },
  health: { failing: 0, lastRunAt: '2026-10-30T12:00:00.000Z' },
})

export const GLOBEX_INVITE: PendingInvite = {
  token: 'inv-globex',
  org: { name: 'Globex', initial: 'G' },
  invitedBy: 'Lena Ortiz',
  orgRole: 'member',
  place: { kind: 'workspace', name: 'Platform', projectName: 'Core', role: 'editor' },
  expiresAt: '2026-11-04T12:00:00.000Z',
}
