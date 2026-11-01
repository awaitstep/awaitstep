import type { ProjectMembers } from '../../types/dashboard/access'
import type { Person } from '../../types/dashboard/session'
import type { ProjectSetup } from '../../types/dashboard/setup'

// What every workspace in a project inherits, as the Workspaces page's
// "Project-wide" and the New workspace dialog's "Also gets" count it.

/** Who opens every workspace as an admin: org owners and admins, and project admins. */
export function projectAdmins(members: ProjectMembers): Person[] {
  return members.wholeProject.filter((m) => m.role !== 'project-member').map((m) => m.person)
}

/** People who can already open every workspace, so picking them for one adds nothing. */
export function wholeProjectIds(members: ProjectMembers): Set<string> {
  return new Set(members.wholeProject.map((m) => m.person.id))
}

/** Every variable a new workspace starts with: the project's and the org's. */
export function inheritedVariables(setup: ProjectSetup): number {
  return setup.projectVariables + setup.orgVariables
}
