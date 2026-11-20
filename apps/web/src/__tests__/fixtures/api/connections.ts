import type {
  AvailableConnection,
  ConnectionAccount,
  ConnectionSummary,
  ProjectConnections,
  ProjectConnectionSummary,
} from '@awaitstep/ir'
import type { ConnectionRow, ProjectRow, SeedDb } from '../seed/rows'

// Cloudflare accounts, as the org's Connections page and a project's accounts
// read them, projected from the seed. Tokens are never checked: a stored one
// reads as working.

const suffix = (row: ConnectionRow) => row.accountId.slice(-4)
const personName = (seed: SeedDb, id: string) => seed.people.find((p) => p.id === id)?.name ?? null

function serves(row: ConnectionRow, project: ProjectRow): boolean {
  if (row.projectId) return row.projectId === project.id
  return row.projects === 'all' || row.projects.includes(project.id)
}

function accountsOf(seed: SeedDb, project: ProjectRow) {
  return seed.projectConnections
    .filter((pc) => pc.projectId === project.id)
    .flatMap((pc) => {
      const row = seed.connections.find((c) => c.id === pc.connectionId)
      return row ? [{ pc, row }] : []
    })
}

function defaultOf(seed: SeedDb, project: ProjectRow): ConnectionRow | undefined {
  return accountsOf(seed, project).find((a) => a.pc.isDefault && serves(a.row, project))?.row
}

/** `GET /connections`: the org's shared accounts, optionally only those serving a project. */
export function orgConnections(
  seed: SeedDb,
  orgId: string,
  projectSlug?: string,
): ConnectionSummary[] {
  const project = projectSlug
    ? seed.projects.find((p) => p.orgId === orgId && p.slug === projectSlug)
    : undefined
  return seed.connections
    .filter((c) => c.orgId === orgId && !c.projectId)
    .filter((c) => !projectSlug || (project !== undefined && serves(c, project)))
    .map((c) => ({
      id: c.id,
      provider: 'cloudflare',
      name: c.name,
      createdByName: personName(seed, c.addedBy),
      accountSuffix: suffix(c),
      allProjects: c.projects === 'all',
      projects:
        c.projects === 'all'
          ? []
          : c.projects.flatMap((id) => {
              const p = seed.projects.find((row) => row.id === id)
              return p ? [{ id: p.id, name: p.name, slug: p.slug }] : []
            }),
      authKind: 'api-token',
      canDeploy: true,
      hiddenProjects: 0,
      tokenStatus: 'active',
      tokenExpiresAt: c.tokenExpiresAt,
      tokenCheckedAt: null,
      deployments: { count: c.deployments, lastAt: c.lastDeployAt },
      createdAt: '2026-09-01T09:00:00.000Z',
      updatedAt: c.lastDeployAt ?? '2026-09-01T09:00:00.000Z',
    }))
}

/** `GET /connections/accounts`: the same accounts, cut to the picker's row. */
export function orgAccounts(seed: SeedDb, orgId: string): ConnectionAccount[] {
  return seed.connections
    .filter((c) => c.orgId === orgId && !c.projectId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      accountSuffix: suffix(c),
      authKind: 'api-token',
      canDeploy: true,
      tokenStatus: 'active',
    }))
}

export function projectConnections(seed: SeedDb, project: ProjectRow): ProjectConnections {
  const connections = accountsOf(seed, project)
    .map(({ pc, row }) => ({
      id: row.id,
      provider: 'cloudflare',
      name: row.name,
      accountSuffix: suffix(row),
      createdByName: personName(seed, row.addedBy),
      scope: row.projectId ? ('project' as const) : ('shared' as const),
      tokenStatus: 'active' as const,
      tokenExpiresAt: row.tokenExpiresAt,
      isDefault: pc.isDefault,
      available: serves(row, project),
      deployments: { count: row.deployments, lastAt: row.lastDeployAt },
      deployedFrom: seed.workspaceConnections
        .filter((wc) => wc.connectionId === row.id)
        .flatMap((wc) => seed.workspaces.find((w) => w.id === wc.workspaceId)?.name ?? []),
      addedAt: row.lastDeployAt ?? '2026-10-01T09:00:00.000Z',
    }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
  const fallback = defaultOf(seed, project)
  const workspaces = seed.workspaces
    .filter((w) => w.projectId === project.id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((w) => {
      const own = seed.workspaceConnections.find((wc) => wc.workspaceId === w.id)
      const override = own && seed.connections.find((c) => c.id === own.connectionId)
      const chosen = override ?? fallback
      return {
        workspaceId: w.id,
        name: w.name,
        connectionId: chosen?.id ?? null,
        connectionName: chosen?.name ?? null,
        source: override
          ? ('override' as const)
          : chosen
            ? ('default' as const)
            : ('none' as const),
        lastDeployAt: chosen?.lastDeployAt ?? null,
      }
    })
  return { connections, workspaces }
}

export function connectionSummary(
  seed: SeedDb,
  project: ProjectRow,
  workspaceId?: string,
): ProjectConnectionSummary {
  const fallback = defaultOf(seed, project)
  if (!workspaceId) {
    return {
      default: fallback
        ? { id: fallback.id, name: fallback.name, accountSuffix: suffix(fallback) }
        : null,
    }
  }
  const own = seed.workspaceConnections.find((wc) => wc.workspaceId === workspaceId)
  const override = own && seed.connections.find((c) => c.id === own.connectionId)
  const chosen = override ?? fallback
  return {
    workspace: {
      connectionId: chosen?.id ?? null,
      connectionName: chosen?.name ?? null,
      source: override ? 'override' : chosen ? 'default' : 'none',
    },
  }
}

export function availableConnections(seed: SeedDb, project: ProjectRow): AvailableConnection[] {
  const added = new Set(accountsOf(seed, project).map((a) => a.row.id))
  return seed.connections
    .filter((c) => c.orgId === project.orgId && !c.projectId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      provider: 'cloudflare',
      name: c.name,
      accountSuffix: suffix(c),
      tokenStatus: 'active' as const,
      tokenExpiresAt: c.tokenExpiresAt,
      state: !serves(c, project)
        ? ('restricted' as const)
        : added.has(c.id)
          ? ('added' as const)
          : ('available' as const),
      restrictedTo:
        c.projects === 'all'
          ? []
          : c.projects.flatMap((id) => seed.projects.find((p) => p.id === id)?.name ?? []),
    }))
}
