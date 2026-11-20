import type {
  ApiKeyPage,
  ApiKeyRow,
  ApiProjectKeys,
  ApiWorkspaceKeys,
} from '../../../lib/dashboard-api'
import type { KeyRow, KeyScopeRow, SeedDb } from '../seed/rows'

// API keys as `/api-keys` lists them for an org admin (Ama), projected from
// the seed. A key reaches a set of projects or workspaces; its home (where it
// is listed as "own") is the org, or the one project or workspace it reaches.

function isLive(key: KeyRow, now: Date): boolean {
  return key.expiresAt === null || new Date(key.expiresAt) > now
}

function homeOf(seed: SeedDb, key: KeyRow): { kind: 'org' | 'project' | 'workspace'; id: string } {
  if (key.level === 'organization') return { kind: 'org', id: key.orgId }
  if (key.level === 'project') {
    return key.projectScopes.length === 1
      ? { kind: 'project', id: key.projectScopes[0]!.id }
      : { kind: 'org', id: key.orgId }
  }
  if (key.workspaceScopes.length === 1) return { kind: 'workspace', id: key.workspaceScopes[0]!.id }
  const workspace = seed.workspaces.find((w) => w.id === key.workspaceScopes[0]!.id)!
  return { kind: 'project', id: workspace.projectId }
}

const live = (scopes: KeyScopeRow[], id: string) =>
  scopes.some((s) => s.id === id && s.revokedAt === null)

function workspaceRef(seed: SeedDb, id: string) {
  const w = seed.workspaces.find((row) => row.id === id)!
  return { id: w.id, slug: w.slug, name: w.name, colour: w.colour }
}

/** One key as the API answers it. */
export function keyRow(seed: SeedDb, key: KeyRow): ApiKeyRow {
  const [head, tail] = key.prefix.split('…')
  return {
    id: key.id,
    level: key.level,
    name: key.name,
    keyPrefix: head!,
    keySuffix: tail ?? null,
    permissions: key.permissions,
    createdBy: key.createdBy,
    createdByName: seed.people.find((p) => p.id === key.createdBy)?.name ?? null,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    projects: key.projectScopes.map((s) => {
      const project = seed.projects.find((p) => p.id === s.id)
      return {
        projectId: s.id,
        projectName: project?.name ?? null,
        projectSlug: project?.slug ?? null,
        revokedAt: s.revokedAt,
      }
    }),
    workspaces: key.workspaceScopes.map((s) => ({
      workspace: workspaceRef(seed, s.id),
      revokedAt: s.revokedAt,
    })),
  }
}

export function orgKeys(seed: SeedDb, orgId: string): ApiKeyPage {
  const own = seed.keys.filter((k) => {
    const home = homeOf(seed, k)
    return home.kind === 'org' && home.id === orgId
  })
  return { data: own.map((k) => keyRow(seed, k)), nextCursor: null }
}

export function projectKeys(seed: SeedDb, projectId: string, now: Date): ApiProjectKeys {
  const own = seed.keys.filter((k) => {
    const home = homeOf(seed, k)
    return home.kind === 'project' && home.id === projectId
  })
  const reaching = seed.keys.filter(
    (k) =>
      k.level === 'project' &&
      k.projectScopes.length > 1 &&
      isLive(k, now) &&
      live(k.projectScopes, projectId),
  )
  const workspaceCounts = seed.workspaces
    .filter((w) => w.projectId === projectId)
    .map((w) => ({
      workspace: workspaceRef(seed, w.id),
      count: seed.keys.filter((k) => k.level === 'workspace' && live(k.workspaceScopes, w.id))
        .length,
    }))
    .filter((w) => w.count > 0)
  return {
    own: own.map((k) => keyRow(seed, k)),
    reaching: reaching.map((k) => keyRow(seed, k)),
    workspaceCounts,
  }
}

export function workspaceKeys(seed: SeedDb, workspaceId: string, now: Date): ApiWorkspaceKeys {
  const projectId = seed.workspaces.find((w) => w.id === workspaceId)!.projectId
  const own = seed.keys.filter((k) => {
    const home = homeOf(seed, k)
    return home.kind === 'workspace' && home.id === workspaceId
  })
  const reaching = seed.keys.filter((k) => {
    if (!isLive(k, now)) return false
    if (k.level === 'workspace' && k.workspaceScopes.length > 1) {
      return live(k.workspaceScopes, workspaceId)
    }
    return k.level === 'project' && live(k.projectScopes, projectId)
  })
  return {
    own: own.map((k) => keyRow(seed, k)),
    reaching: reaching.map((k) => keyRow(seed, k)),
  }
}
