import type { MockDb } from '../db'
import { seedAudit } from './audit'
import { NOTIFICATION_READS, RELEASE_VISITS, seedEditRequests, seedNotifications } from './inbox'
import { CALLS, seedItems } from './items'
import { seedKeys } from './keys'
import { seedConnections, seedInvitations } from './org-settings'
import { seedOrgMembers, seedOrgs } from './orgs'
import { PEOPLE } from './people'
import { PROJECT_MEMBERS, seedProjects } from './projects'
import { seedNodes } from './resources'
import { seedRuns } from './runs'
import { VARIABLES } from './variables'
import { WORKSPACE_MEMBERS, seedWorkspaces } from './workspaces'

/** A fresh copy of the canvas sample data, with times relative to `now`. */
export function seedDb(now: Date): MockDb {
  const orgs = seedOrgs(now)
  return structuredClone({
    people: PEOPLE,
    orgs,
    orgMembers: seedOrgMembers(now),
    projects: seedProjects(now),
    projectMembers: PROJECT_MEMBERS,
    workspaces: seedWorkspaces(now),
    workspaceMembers: WORKSPACE_MEMBERS,
    items: seedItems(now),
    runs: seedRuns(now),
    calls: CALLS,
    editRequests: seedEditRequests(now),
    keys: seedKeys(now),
    variables: VARIABLES,
    invitations: seedInvitations(now),
    connections: seedConnections(now),
    nodes: seedNodes(orgs.map((o) => o.id)),
    audit: seedAudit(now),
    notifications: seedNotifications(now),
    notificationReads: NOTIFICATION_READS,
    releaseVisits: RELEASE_VISITS,
  })
}
