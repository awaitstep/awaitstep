import type {
  ApiKey,
  CreatedKey,
  NewKeyInput,
  ProjectKeys,
  WorkspaceKeys,
} from '../../../types/dashboard/api-keys'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import { getDb, type KeyRow, type KeyScopeRow, type MockDb } from '../db'
import { endpoint, invalidError, mutation, notFoundError, rows } from '../scenario'
import { workspaceRef } from './item-records'
import { orgScope, personById, visibleWorkspaces } from './records'
import { newId, requireScope } from './resolve'
import { requireLevel } from './levels'
import { grantsOutsideLevel } from '../../../components/keys/parts/key-permissions'
import type { LevelSlugs } from '../../../types/dashboard/scope'
import type { MockContext } from '../scenario'

// Multi-scope ("bundle") API keys, listed, created and revoked. One key reaches
// a SET of projects or workspaces; each scope carries its own revoked state, so
// one consumer can drop the key while the others keep it (per-consumer revoke),
// and the owner keeps a kill-switch at the key's home.

/** Not yet expired: the key still reaches what it was made for. */
export function isLive(key: KeyRow, now: Date = new Date()): boolean {
  return key.expiresAt === null || new Date(key.expiresAt) > now
}

/**
 * Where a key's kill-switch lives, from its TOTAL scope set (so it stays put as
 * consumers revoke): the org for org and multi-project keys, the one project or
 * workspace for a single-scope key, the common project for a multi-workspace key.
 */
function homeOf(db: MockDb, key: KeyRow): { kind: LevelSlugs['level']; id: string } {
  if (key.level === 'organization') return { kind: 'organization', id: key.orgId }
  if (key.level === 'project') {
    return key.projectScopes.length === 1
      ? { kind: 'project', id: key.projectScopes[0]!.id }
      : { kind: 'organization', id: key.orgId }
  }
  if (key.workspaceScopes.length === 1) {
    return { kind: 'workspace', id: key.workspaceScopes[0]!.id }
  }
  const workspace = db.workspaces.find((w) => w.id === key.workspaceScopes[0]!.id)
  return { kind: 'project', id: workspace!.projectId }
}

const liveProjectScope = (key: KeyRow, projectId: string): KeyScopeRow | undefined =>
  key.projectScopes.find((s) => s.id === projectId && s.revokedAt === null)

const liveWorkspaceScope = (key: KeyRow, workspaceId: string): KeyScopeRow | undefined =>
  key.workspaceScopes.find((s) => s.id === workspaceId && s.revokedAt === null)

/**
 * What a non-admin consumer may see of a bundle reaching it: only the slice
 * reaching the place shown here, never the sibling projects/workspaces it also
 * reaches (an org admin sees the whole set; see `listByProject` in the db).
 */
function narrowReach(key: ApiKey, only: { projectId?: string; workspaceId?: string }): ApiKey {
  return {
    ...key,
    projects: only.projectId ? key.projects.filter((p) => p.id === only.projectId) : key.projects,
    workspaces: only.workspaceId
      ? key.workspaces.filter((w) => w.workspace.id === only.workspaceId)
      : key.workspaces,
  }
}

function keyRecord(db: MockDb, row: KeyRow): ApiKey {
  return {
    id: row.id,
    level: row.level,
    name: row.name,
    prefix: row.prefix,
    permissions: row.permissions,
    createdBy: { id: row.createdBy, name: personById(db, row.createdBy).name },
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    projects: row.projectScopes.map((s) => {
      const project = db.projects.find((p) => p.id === s.id)
      return {
        id: s.id,
        name: project?.name ?? null,
        slug: project?.slug ?? null,
        revokedAt: s.revokedAt,
      }
    }),
    workspaces: row.workspaceScopes.map((s) => {
      const workspace = db.workspaces.find((w) => w.id === s.id)!
      return { workspace: workspaceRef(workspace), revokedAt: s.revokedAt }
    }),
  }
}

/**
 * The project's own keys (single-project keys and multi-workspace keys homed
 * here), the multi-project keys reaching it with a live slice, and a key count
 * per workspace the viewer can open.
 */
export const listProjectKeys = endpoint(
  (ctx, orgSlug: string, projectSlug: string): ProjectKeys => {
    const db = getDb()
    const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const pid = project!.id
    // Only an org admin sees a reaching bundle's sibling projects.
    const fullReach = orgScope(db, ctx, org).viewerCan.manageSettings.allowed
    const own = db.keys.filter((k) => {
      const home = homeOf(db, k)
      return home.kind === 'project' && home.id === pid
    })
    // An expired bundle no longer reaches anything, as with the workspace tab and the setup count.
    const reaching = db.keys.filter(
      (k) =>
        k.level === 'project' &&
        k.projectScopes.length > 1 &&
        isLive(k) &&
        !!liveProjectScope(k, pid),
    )
    const workspaceKeys = visibleWorkspaces(db, ctx, project!)
      .map((w) => ({
        workspace: workspaceRef(w),
        count: db.keys.filter((k) => k.level === 'workspace' && !!liveWorkspaceScope(k, w.id))
          .length,
      }))
      .filter((w) => w.count > 0)
    return {
      own: rows(
        ctx,
        own.map((k) => keyRecord(db, k)),
      ),
      reaching: rows(
        ctx,
        reaching.map((k) => {
          const rec = keyRecord(db, k)
          return fullReach ? rec : narrowReach(rec, { projectId: pid })
        }),
      ),
      workspaceKeys: rows(ctx, workspaceKeys),
    }
  },
)

/** Kills a key whole at its home, after checking the viewer manages keys there. */
function revoke(ctx: MockContext, orgSlug: string, slugs: LevelSlugs, keyId: string): void {
  const db = getDb()
  const at = requireLevel(db, ctx, orgSlug, slugs, 'keys')
  const key = db.keys.find((k) => {
    if (k.id !== keyId) return false
    const home = homeOf(db, k)
    return home.kind === at.level && home.id === at.target.id
  })
  if (!key) throw notFoundError()
  db.keys = db.keys.filter((k) => k !== key)
}

/**
 * Drops one consumer's slice of a shared key (per-consumer revoke); when the
 * last live slice is gone the key itself dies.
 */
function revokeScope(ctx: MockContext, orgSlug: string, slugs: LevelSlugs, keyId: string): void {
  const db = getDb()
  const at = requireLevel(db, ctx, orgSlug, slugs, 'keys')
  const key = db.keys.find((k) => k.id === keyId)
  if (!key) throw notFoundError()
  const scope =
    at.level === 'project'
      ? liveProjectScope(key, at.target.id)
      : at.level === 'workspace'
        ? liveWorkspaceScope(key, at.target.id)
        : undefined
  if (!scope) throw notFoundError()
  scope.revokedAt = new Date().toISOString()
  const anyLive =
    key.projectScopes.some((s) => s.revokedAt === null) ||
    key.workspaceScopes.some((s) => s.revokedAt === null)
  if (!anyLive) db.keys = db.keys.filter((k) => k !== key)
}

/** Revokes a project key whole (the kill-switch). Needs the project's manageKeys. */
export const revokeProjectKey = mutation(
  (ctx, orgSlug: string, projectSlug: string, keyId: string): void =>
    revoke(ctx, orgSlug, { level: 'project', project: projectSlug }, keyId),
)

/** Drops this project's slice of a shared key. Needs the project's manageKeys. */
export const revokeProjectKeyScope = mutation(
  (ctx, orgSlug: string, projectSlug: string, keyId: string): void =>
    revokeScope(ctx, orgSlug, { level: 'project', project: projectSlug }, keyId),
)

/**
 * Workspace settings → API keys: its own keys, the multi-workspace keys reaching
 * it with a live slice, and the project keys that work in every workspace.
 */
export const listWorkspaceKeys = endpoint((ctx, slugs: Required<ScopeSlugs>): WorkspaceKeys => {
  const db = getDb()
  const { org, project, workspace } = requireScope(db, ctx, slugs)
  const wid = workspace!.id
  const pid = project!.id
  // Only an org admin sees a reaching bundle's sibling workspaces (or projects).
  const fullReach = orgScope(db, ctx, org).viewerCan.manageSettings.allowed
  const own = db.keys.filter((k) => {
    const home = homeOf(db, k)
    return home.kind === 'workspace' && home.id === wid
  })
  const reaching = db.keys.filter((k) => {
    // An expired bundle no longer reaches anything, so it isn't listed here
    // (matching the backend's `reachesAsWorkspace`/`reachesAsProject`).
    if (!isLive(k)) return false
    if (k.level === 'workspace' && k.workspaceScopes.length > 1) {
      return !!liveWorkspaceScope(k, wid)
    }
    if (k.level === 'project') return !!liveProjectScope(k, pid)
    return false
  })
  return {
    own: rows(
      ctx,
      own.map((k) => keyRecord(db, k)),
    ),
    reaching: rows(
      ctx,
      reaching.map((k) => {
        const rec = keyRecord(db, k)
        return fullReach ? rec : narrowReach(rec, { projectId: pid, workspaceId: wid })
      }),
    ),
  }
})

/** Revokes one of the workspace's own keys whole. Needs the workspace's manageKeys. */
export const revokeWorkspaceKey = mutation(
  (ctx, slugs: Required<ScopeSlugs>, keyId: string): void =>
    revoke(
      ctx,
      slugs.org,
      { level: 'workspace', project: slugs.project, workspace: slugs.workspace },
      keyId,
    ),
)

/** Drops this workspace's slice of a shared key. Needs the workspace's manageKeys. */
export const revokeWorkspaceKeyScope = mutation(
  (ctx, slugs: Required<ScopeSlugs>, keyId: string): void =>
    revokeScope(
      ctx,
      slugs.org,
      { level: 'workspace', project: slugs.project, workspace: slugs.workspace },
      keyId,
    ),
)

/**
 * Org Settings → API keys: org keys and the multi-project keys homed at the org.
 * Owners and admins only, as the real API 403s anyone else (the dashboard already
 * gates the request, but the mock enforces it so dev/testing sees the boundary).
 */
export const listOrgKeys = endpoint((ctx, orgSlug: string): ApiKey[] => {
  const db = getDb()
  const { org } = requireLevel(db, ctx, orgSlug, { level: 'organization' }, 'keys')
  return rows(
    ctx,
    db.keys
      .filter((k) => {
        const home = homeOf(db, k)
        return home.kind === 'organization' && home.id === org.id
      })
      .map((k) => keyRecord(db, k)),
  )
})

/** Revokes an org-homed key. Needs the org's manageSettings. */
export const revokeOrgKey = mutation((ctx, orgSlug: string, keyId: string): void =>
  revoke(ctx, orgSlug, { level: 'organization' }, keyId),
)

const EXPIRY_DAYS = { '30': 30, '90': 90, '365': 365, never: null } as const
const SECRET_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/** The API's shape: `ask_` and forty characters, whatever the level. */
function secretFor(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(40))
  const tail = [...bytes].map((b) => SECRET_CHARS[b % SECRET_CHARS.length]).join('')
  return `ask_${tail}`
}

/** The chosen ids that really belong to the parent, as fresh (live) scope rows. */
function scopesFor(
  db: MockDb,
  ids: string[],
  kind: 'projects' | 'workspaces',
  parentId: string,
): KeyScopeRow[] {
  const belong =
    kind === 'projects'
      ? db.projects.filter((p) => p.orgId === parentId).map((p) => p.id)
      : db.workspaces.filter((w) => w.projectId === parentId).map((w) => w.id)
  const picked = ids.filter((id) => belong.includes(id))
  if (picked.length === 0) {
    throw invalidError(
      `Pick at least one ${kind === 'projects' ? 'project' : 'workspace'}`,
      'level',
    )
  }
  return picked.map((id) => ({ id, revokedAt: null }))
}

/**
 * Create an API key at any level. A project-level key minted at the org names a
 * set of `projectIds`; a workspace-level key minted at a project names a set of
 * `workspaceIds`; otherwise the set is the one addressed place. The secret comes
 * back this once; only its prefix is kept (D-P6-2).
 */
export const createKey = mutation((ctx, orgSlug: string, input: NewKeyInput): CreatedKey => {
  const db = getDb()
  const name = input.name.trim()
  if (!name) throw invalidError('Give the key a name', 'name')
  if (!(input.expires in EXPIRY_DAYS)) throw invalidError('Pick when it expires', 'expires')
  const granted = Object.values(input.permissions).some((actions) => actions && actions.length > 0)
  if (!granted) throw invalidError('Pick at least one permission', 'permissions')
  const outside = grantsOutsideLevel(input.level, input.permissions)
  if (outside.length > 0) {
    throw invalidError(`Not available on this kind of key: ${outside.join(', ')}`, 'permissions')
  }

  const { org } = requireScope(db, ctx, { org: orgSlug })
  let projectScopes: KeyScopeRow[] = []
  let workspaceScopes: KeyScopeRow[] = []
  if (input.level === 'organization') {
    requireLevel(db, ctx, orgSlug, { level: 'organization' }, 'keys')
  } else if (input.level === 'project') {
    if (input.projectIds && input.projectIds.length > 0) {
      requireLevel(db, ctx, orgSlug, { level: 'organization' }, 'keys')
      projectScopes = scopesFor(db, input.projectIds, 'projects', org.id)
    } else {
      const at = requireLevel(
        db,
        ctx,
        orgSlug,
        { level: 'project', project: input.project },
        'keys',
      )
      projectScopes = [{ id: at.target.id, revokedAt: null }]
    }
  } else {
    if (input.workspaceIds && input.workspaceIds.length > 0) {
      const at = requireLevel(
        db,
        ctx,
        orgSlug,
        { level: 'project', project: input.project },
        'keys',
      )
      workspaceScopes = scopesFor(db, input.workspaceIds, 'workspaces', at.target.id)
    } else {
      const at = requireLevel(
        db,
        ctx,
        orgSlug,
        { level: 'workspace', project: input.project, workspace: input.workspace },
        'keys',
      )
      workspaceScopes = [{ id: at.target.id, revokedAt: null }]
    }
  }

  const secret = secretFor()
  const days = EXPIRY_DAYS[input.expires]
  const now = new Date()
  const row: KeyRow = {
    id: newId('key'),
    level: input.level,
    orgId: org.id,
    name,
    prefix: `${secret.slice(0, 8)}…${secret.slice(-4)}`,
    permissions: input.permissions,
    createdBy: ctx.userId,
    createdAt: now.toISOString(),
    lastUsedAt: null,
    expiresAt: days === null ? null : new Date(now.getTime() + days * 86_400_000).toISOString(),
    projectScopes,
    workspaceScopes,
  }
  db.keys.unshift(row)
  return { key: keyRecord(db, row), secret }
})
