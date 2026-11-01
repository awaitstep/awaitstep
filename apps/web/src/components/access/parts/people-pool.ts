import type { ProjectMembers, ProjectWideRole } from '../../../types/dashboard/access'
import type { Person } from '../../../types/dashboard/session'
import type { WorkspacePerson } from '../../../types/dashboard/workspaces'

// Who the Add people picker (21a, 21b) offers, and what it says about each:
// from the org's people, the project's members and the workspace's people,
// all lists the page already reads.

/** `has`: already where they'd be added (shown, not pickable); `project`: in the project; `org`: only in the org. */
export type PoolTier = 'has' | 'project' | 'org'

export interface PoolPerson {
  person: Person
  tier: PoolTier
  /** "In Project 101 · IT", "Already has access · whole project"; the email when there's nothing to say. */
  note: string
  /** In the org but not the project: adding them to a workspace brings them into it (21b). */
  joins: boolean
}

const WIDE_LABEL: Record<ProjectWideRole, string> = {
  owner: 'Org owner',
  'org-admin': 'Org admin',
  'project-admin': 'Project admin',
  'project-member': 'Member',
}

const WORKSPACE_ROLE_LABEL = { admin: 'Workspace admin', editor: 'Editor', viewer: 'Viewer' }

function workspacesOf(members: ProjectMembers): Map<string, string[]> {
  return new Map(
    members.workspacesOnly.map((m) => [m.person.id, m.workspaces.map((w) => w.workspace.name)]),
  )
}

/** 21b's people: who already opens the workspace, who's in the project, who's only in the org. */
export function workspacePool(input: {
  orgPeople: Person[]
  members: ProjectMembers
  workspacePeople: WorkspacePerson[]
  orgName: string
  projectName: string
}): PoolPerson[] {
  const here = new Map(input.workspacePeople.map((p) => [p.person.id, p]))
  const wide = new Set(input.members.wholeProject.map((m) => m.person.id))
  const elsewhere = workspacesOf(input.members)
  return input.orgPeople.map((person): PoolPerson => {
    const has = here.get(person.id)
    if (has) {
      const how = has.inherited ? 'whole project' : WORKSPACE_ROLE_LABEL[has.role]
      return { person, tier: 'has', note: `Already has access · ${how}`, joins: false }
    }
    const spaces = elsewhere.get(person.id)
    if (wide.has(person.id) || spaces) {
      const where = spaces?.length ? ` · ${spaces.join(', ')}` : ''
      return { person, tier: 'project', note: `In ${input.projectName}${where}`, joins: false }
    }
    return {
      person,
      tier: 'org',
      note: `In ${input.orgName}, not in ${input.projectName}`,
      joins: true,
    }
  })
}

/** 21a's people: who's already in the project (and how), and everyone else in the org. */
export function projectPool(input: { orgPeople: Person[]; members: ProjectMembers }): PoolPerson[] {
  const wide = new Map(input.members.wholeProject.map((m) => [m.person.id, m.role]))
  const spaces = workspacesOf(input.members)
  return input.orgPeople.map((person): PoolPerson => {
    const role = wide.get(person.id)
    const names = spaces.get(person.id)
    if (role || names) {
      const how = role ? WIDE_LABEL[role] : names!.join(', ')
      return { person, tier: 'has', note: `Already in this project · ${how}`, joins: false }
    }
    return { person, tier: 'org', note: person.email, joins: false }
  })
}

/** People whose name or email has `query` in it; everyone for an empty one. */
export function matchPool(pool: PoolPerson[], query: string): PoolPerson[] {
  const q = query.trim().toLowerCase()
  if (!q) return pool
  return pool.filter(
    ({ person }) => person.name.toLowerCase().includes(q) || person.email.toLowerCase().includes(q),
  )
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The address to offer "Invite {email}" for: a full email nobody in the org has, not picked yet. */
export function inviteCandidate(
  query: string,
  pool: PoolPerson[],
  pickedEmails: string[],
): string | null {
  const email = query.trim().toLowerCase()
  if (!EMAIL.test(email)) return null
  if (pool.some(({ person }) => person.email.toLowerCase() === email)) return null
  if (pickedEmails.includes(email)) return null
  return email
}
