import type { OrgCapability } from '@awaitstep/ir'
import type { ApiCapabilities, ApiOrg, ApiOrgListing } from '../../../lib/dashboard-api'
import { daysAgo, minutesAgo } from './clock'

export const ACME = 'org_acme'
export const BOLT = 'org_bolt'
export const GLOBEX = 'org_globex'
export const SANDBOX = 'org_sandbox'

const ALL_ORG: ApiCapabilities<OrgCapability> = {
  createProject: { allowed: true },
  manageSettings: { allowed: true },
  delete: { allowed: true },
}

const ORG_ADMIN: ApiCapabilities<OrgCapability> = {
  ...ALL_ORG,
  delete: { allowed: false, reason: 'Only org owners can do this' },
}

/** Ama's organizations as `GET /scope` names them: owner of Acme, admin of Bolt Labs. */
export function amaOrgs(now: Date): Record<string, ApiOrg> {
  return {
    acme: {
      id: ACME,
      slug: 'acme',
      name: 'Acme Inc',
      logo: null,
      createdAt: daysAgo(now, 400),
      role: 'owner',
      projectCount: 3,
      memberCount: 6,
      viewerCan: ALL_ORG,
    },
    'bolt-labs': {
      id: BOLT,
      slug: 'bolt-labs',
      name: 'Bolt Labs',
      logo: null,
      createdAt: daysAgo(now, 200),
      role: 'admin',
      projectCount: 1,
      memberCount: 2,
      viewerCan: ORG_ADMIN,
    },
  }
}

/** `GET /orgs` for Ama: an owner and an admin see everything, so no grants. */
export function amaOrgListings(now: Date): ApiOrgListing[] {
  const orgs = amaOrgs(now)
  const none = { projects: [], workspaces: [] }
  return [
    { ...orgs.acme!, grants: none, health: { failing: 1, lastRunAt: minutesAgo(now, 5) } },
    { ...orgs['bolt-labs']!, grants: none, health: { failing: 0, lastRunAt: null } },
  ]
}
