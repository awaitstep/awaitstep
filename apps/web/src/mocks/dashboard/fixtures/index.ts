import type { MockDb } from '../db'
import { seedOrgMembers, seedOrgs } from './orgs'
import { PEOPLE } from './people'
import { PROJECT_MEMBERS, seedProjects } from './projects'
import { WORKSPACE_MEMBERS, seedWorkspaces } from './workspaces'

/** A fresh copy of the canvas sample data, with times relative to `now`. */
export function seedDb(now: Date): MockDb {
  return structuredClone({
    people: PEOPLE,
    orgs: seedOrgs(now),
    orgMembers: seedOrgMembers(now),
    projects: seedProjects(now),
    projectMembers: PROJECT_MEMBERS,
    workspaces: seedWorkspaces(now),
    workspaceMembers: WORKSPACE_MEMBERS,
  })
}
