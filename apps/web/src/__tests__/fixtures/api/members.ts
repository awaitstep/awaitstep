import { resolveRoles, type RoleGrants } from '@awaitstep/ir'
import type {
  ApiOrgMember,
  ApiProjectMembers,
  ApiWorkspacePerson,
} from '../../../lib/dashboard-api'
import type { ProjectRow, SeedDb, WorkspaceRow } from '../seed/rows'

// Who can open a workspace, projected from the seed's org, project and
// workspace grants with the API's own role rules (`resolveRoles`).

export function grantsOf(
  seed: SeedDb,
  userId: string,
  project: ProjectRow,
  workspace?: WorkspaceRow,
): RoleGrants {
  return {
    orgRole:
      seed.orgMembers.find((m) => m.orgId === project.orgId && m.userId === userId)?.role ?? null,
    projectGrant:
      seed.projectMembers.find((m) => m.projectId === project.id && m.userId === userId)?.role ??
      null,
    workspaceGrant: workspace
      ? (seed.workspaceMembers.find((m) => m.workspaceId === workspace.id && m.userId === userId)
          ?.role ?? null)
      : null,
  }
}

/** `GET /workspaces/:id/members`: org owners and admins, its own members, then the project's. */
export function workspacePeople(seed: SeedDb, workspaceId: string): ApiWorkspacePerson[] {
  const workspace = seed.workspaces.find((w) => w.id === workspaceId)
  const project = seed.projects.find((p) => p.id === workspace?.projectId)
  if (!workspace || !project) return []
  const ids = [
    ...seed.orgMembers
      .filter((m) => m.orgId === project.orgId && (m.role === 'owner' || m.role === 'admin'))
      .map((m) => m.userId),
    ...seed.workspaceMembers.filter((m) => m.workspaceId === workspace.id).map((m) => m.userId),
    ...seed.projectMembers.filter((m) => m.projectId === project.id).map((m) => m.userId),
  ]
  return [...new Set(ids)].flatMap((userId) => {
    const roles = resolveRoles(grantsOf(seed, userId, project, workspace))
    const person = seed.people.find((p) => p.id === userId)
    if (!roles.workspaceRole || !person) return []
    const orgRole = roles.orgRole === 'owner' || roles.orgRole === 'admin' ? roles.orgRole : null
    return [
      {
        id: person.id,
        name: person.name,
        email: person.email,
        image: person.image ?? null,
        role: roles.workspaceRole,
        inherited: roles.workspaceRole === roles.inheritedWorkspaceRole,
        projectRole: roles.inheritedWorkspaceRole,
        orgRole,
        lastActiveAt:
          seed.orgMembers.find((m) => m.orgId === project.orgId && m.userId === userId)
            ?.lastOpenedAt ?? null,
      },
    ]
  })
}

/** `GET /members?org=`: everyone in the org, with the places their grants give them. */
export function orgMembers(seed: SeedDb, orgId: string): ApiOrgMember[] {
  return seed.orgMembers
    .filter((m) => m.orgId === orgId)
    .flatMap((m) => {
      const person = seed.people.find((p) => p.id === m.userId)
      if (!person) return []
      const projectPlaces = seed.projectMembers
        .filter((pm) => pm.userId === m.userId)
        .flatMap((pm) => {
          const project = seed.projects.find((p) => p.id === pm.projectId && p.orgId === orgId)
          return project
            ? [{ project: projectRef(seed, project.id), workspace: null, role: pm.role }]
            : []
        })
      const workspacePlaces = seed.workspaceMembers
        .filter((wm) => wm.userId === m.userId)
        .flatMap((wm) => {
          const workspace = seed.workspaces.find((w) => w.id === wm.workspaceId)
          const project = seed.projects.find((p) => p.id === workspace?.projectId)
          if (!workspace || !project || project.orgId !== orgId) return []
          return [
            {
              project: projectRef(seed, project.id),
              workspace: { id: workspace.id, name: workspace.name },
              role: wm.role,
            },
          ]
        })
      return [
        {
          id: person.id,
          name: person.name,
          email: person.email,
          image: person.image ?? null,
          role: m.role,
          joinedAt: m.joinedAt,
          places: [...projectPlaces, ...workspacePlaces],
        },
      ]
    })
}

function projectRef(seed: SeedDb, projectId: string) {
  const project = seed.projects.find((p) => p.id === projectId)!
  return {
    id: project.id,
    name: project.name,
    workspaceCount: seed.workspaces.filter((w) => w.projectId === projectId).length,
  }
}

/** `GET /members?org=&project=`: who has the whole project, and who only some workspaces. */
export function projectMembers(seed: SeedDb, project: ProjectRow): ApiProjectMembers {
  const personRef = (id: string) => {
    const p = seed.people.find((row) => row.id === id)!
    return { id: p.id, name: p.name, email: p.email, image: p.image ?? null }
  }
  const orgAdmins = seed.orgMembers.filter(
    (m) => m.orgId === project.orgId && (m.role === 'owner' || m.role === 'admin'),
  )
  const whole = [
    ...orgAdmins.map((m) => ({
      person: personRef(m.userId),
      role: (m.role === 'owner' ? 'owner' : 'org-admin') as 'owner' | 'org-admin',
    })),
    ...seed.projectMembers
      .filter((pm) => pm.projectId === project.id && !orgAdmins.some((a) => a.userId === pm.userId))
      .map((pm) => ({
        person: personRef(pm.userId),
        role: (pm.role === 'admin' ? 'project-admin' : 'project-member') as
          'project-admin' | 'project-member',
      })),
  ]
  const wholeIds = new Set(whole.map((w) => w.person.id))
  const workspaces = seed.workspaces.filter((w) => w.projectId === project.id)
  const onlyIds = [
    ...new Set(
      seed.workspaceMembers
        .filter((wm) => workspaces.some((w) => w.id === wm.workspaceId) && !wholeIds.has(wm.userId))
        .map((wm) => wm.userId),
    ),
  ]
  return {
    wholeProject: whole,
    workspacesOnly: onlyIds.map((userId) => ({
      person: personRef(userId),
      workspaces: seed.workspaceMembers
        .filter((wm) => wm.userId === userId && workspaces.some((w) => w.id === wm.workspaceId))
        .map((wm) => {
          const w = workspaces.find((row) => row.id === wm.workspaceId)!
          return {
            workspace: { id: w.id, slug: w.slug, name: w.name, colour: w.colour },
            role: wm.role,
          }
        }),
    })),
  }
}
