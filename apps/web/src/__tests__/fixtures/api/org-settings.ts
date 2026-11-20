import type { ApiInvitation, ApiPersonAccess } from '../../../lib/dashboard-api'
import type { SeedDb } from '../seed/rows'

// Org Settings' reads, projected from the seed: one person's access across
// the org's projects and workspaces, and the org's pending invitations.

const DAY_MS = 24 * 60 * 60 * 1000

export function personAccess(seed: SeedDb, orgId: string, userId: string): ApiPersonAccess | null {
  const membership = seed.orgMembers.find((m) => m.orgId === orgId && m.userId === userId)
  const person = seed.people.find((p) => p.id === userId)
  if (!membership || !person) return null
  const projects = seed.projects.filter((p) => p.orgId === orgId)
  return {
    person: { id: person.id, name: person.name, email: person.email, image: person.image ?? null },
    joinedAt: membership.joinedAt,
    orgRole: membership.role,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      workspaces: seed.workspaces
        .filter((w) => w.projectId === p.id)
        .map((w) => ({ id: w.id, slug: w.slug, name: w.name, colour: w.colour })),
    })),
    projectRoles: Object.fromEntries(
      seed.projectMembers
        .filter((pm) => pm.userId === userId && projects.some((p) => p.id === pm.projectId))
        .map((pm) => [pm.projectId, pm.role]),
    ),
    workspaceRoles: Object.fromEntries(
      seed.workspaceMembers
        .filter((wm) => wm.userId === userId)
        .map((wm) => [wm.workspaceId, wm.role]),
    ),
  }
}

export function invitations(seed: SeedDb, orgId: string): ApiInvitation[] {
  return seed.invitations
    .filter((i) => i.orgId === orgId && !i.declined)
    .map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      places: i.places.map((place) => {
        const project = seed.projects.find((p) => p.id === place.projectId)
        const workspace = place.workspaceId
          ? seed.workspaces.find((w) => w.id === place.workspaceId)
          : undefined
        return {
          kind: workspace ? ('workspace' as const) : ('project' as const),
          project: project?.name ?? '',
          workspace: workspace?.name ?? null,
          role: place.role,
        }
      }),
      sentAt: i.sentAt,
      expiresAt: new Date(Date.parse(i.sentAt) + 7 * DAY_MS).toISOString(),
      invitedBy: {
        id: i.invitedBy,
        name: seed.people.find((p) => p.id === i.invitedBy)?.name ?? '',
      },
      askedForNewAt: i.askedForNewAt ?? null,
    }))
}
