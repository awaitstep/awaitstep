import type { ApiProjectSummary } from '../../../lib/dashboard-api'
import type { ProjectRow, SeedDb } from '../seed/rows'
import { projectKeys } from './keys'
import { projectVariables } from './variables'

// A project's Workspaces page summary (`GET /projects/:id/summary`): who can
// open every workspace, how many keys and variables, what is shared.

export function projectSummary(seed: SeedDb, project: ProjectRow, now: Date): ApiProjectSummary {
  const orgAdmins = seed.orgMembers
    .filter((m) => m.orgId === project.orgId && (m.role === 'owner' || m.role === 'admin'))
    .map((m) => m.userId)
  const projectAdmins = seed.projectMembers
    .filter((m) => m.projectId === project.id && m.role === 'admin')
    .map((m) => m.userId)
  const admins = [...new Set([...orgAdmins, ...projectAdmins])].flatMap((id) => {
    const p = seed.people.find((row) => row.id === id)
    return p ? [{ id: p.id, name: p.name, image: p.image ?? null }] : []
  })
  const keys = projectKeys(seed, project.id, now)
  const variables = projectVariables(seed, project.id, now)
  const own = variables.filter((v) => v.setAt.level === 'project').length
  const workspaceIds = new Set(
    seed.workspaces.filter((w) => w.projectId === project.id).map((w) => w.id),
  )
  const shared = seed.items.filter((i) => i.sharing && workspaceIds.has(i.workspaceId))
  return {
    admins: { count: admins.length, people: admins.slice(0, 5) },
    projectKeys: keys.own.length + keys.reaching.length,
    variables: {
      total: variables.length,
      own,
      inherited: variables.length - own,
      first: variables.slice(0, 2).map((v) => v.name),
    },
    shared: {
      count: shared.length,
      first: shared.slice(0, 2).map((item) => {
        const from = seed.workspaces.find((w) => w.id === item.workspaceId)!
        return {
          id: item.id,
          name: item.name,
          kind: item.kind,
          from: { id: from.id, slug: from.slug, name: from.name, colour: from.colour },
        }
      }),
    },
  }
}
