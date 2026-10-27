import type { ApiKey, ProjectKeys, WorkspaceKeys } from '../../../types/dashboard/api-keys'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import { getDb, type KeyRow, type MockDb } from '../db'
import { endpoint, forbiddenError, mutation, notFoundError, rows } from '../scenario'
import { workspaceRef } from './item-records'
import { orgScope, personById, projectScope, visibleWorkspaces, workspaceScope } from './records'
import { requireScope } from './resolve'

// API keys, listed and revoked. Creating them is P6.

/** Not yet expired: the key still reaches what it was made for. */
export function isLive(key: KeyRow, now: Date = new Date()): boolean {
  return key.expiresAt === null || new Date(key.expiresAt) > now
}

function keyRecord(db: MockDb, row: KeyRow): ApiKey {
  const workspace = row.workspaceId ? db.workspaces.find((w) => w.id === row.workspaceId) : null
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
    workspace: workspace ? workspaceRef(workspace) : null,
  }
}

/** The project's own keys, and a count per workspace for the workspaces the viewer can open. */
export const listProjectKeys = endpoint(
  (ctx, orgSlug: string, projectSlug: string): ProjectKeys => {
    const db = getDb()
    const { project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const keys = db.keys.filter((k) => k.level === 'project' && k.projectId === project!.id)
    const workspaceKeys = visibleWorkspaces(db, ctx, project!)
      .map((w) => ({
        workspace: workspaceRef(w),
        count: db.keys.filter((k) => k.workspaceId === w.id).length,
      }))
      .filter((w) => w.count > 0)
    return {
      keys: rows(
        ctx,
        keys.map((k) => keyRecord(db, k)),
      ),
      workspaceKeys: rows(ctx, workspaceKeys),
    }
  },
)

/** Revokes a project key. Needs the project's manageKeys. */
export const revokeProjectKey = mutation(
  (ctx, orgSlug: string, projectSlug: string, keyId: string): void => {
    const db = getDb()
    const { project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    const can = projectScope(db, ctx, project!).viewerCan.manageKeys
    if (!can.allowed) throw forbiddenError(can.reason!)
    const key = db.keys.find(
      (k) => k.id === keyId && k.level === 'project' && k.projectId === project!.id,
    )
    if (!key) throw notFoundError()
    db.keys = db.keys.filter((k) => k !== key)
  },
)

/** Workspace settings → API keys: its own keys, and the project keys that reach it. */
export const listWorkspaceKeys = endpoint((ctx, slugs: Required<ScopeSlugs>): WorkspaceKeys => {
  const db = getDb()
  const { project, workspace } = requireScope(db, ctx, slugs)
  const own = db.keys.filter((k) => k.level === 'workspace' && k.workspaceId === workspace!.id)
  // An expired project key no longer reaches anything, so it isn't listed as reaching this one.
  const inherited = db.keys.filter(
    (k) => k.level === 'project' && k.projectId === project!.id && isLive(k),
  )
  return {
    own: rows(
      ctx,
      own.map((k) => keyRecord(db, k)),
    ),
    inherited: rows(
      ctx,
      inherited.map((k) => keyRecord(db, k)),
    ),
  }
})

/** Revokes one of the workspace's own keys. Needs the workspace's manageKeys. */
export const revokeWorkspaceKey = mutation(
  (ctx, slugs: Required<ScopeSlugs>, keyId: string): void => {
    const db = getDb()
    const { project, workspace } = requireScope(db, ctx, slugs)
    const can = workspaceScope(db, ctx, project!, workspace!).viewerCan.manageKeys
    if (!can.allowed) throw forbiddenError(can.reason!)
    const key = db.keys.find(
      (k) => k.id === keyId && k.level === 'workspace' && k.workspaceId === workspace!.id,
    )
    if (!key) throw notFoundError()
    db.keys = db.keys.filter((k) => k !== key)
  },
)

/** Org Settings → API keys. */
export const listOrgKeys = endpoint((ctx, orgSlug: string): ApiKey[] => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  return rows(
    ctx,
    db.keys
      .filter((k) => k.level === 'organization' && k.orgId === org.id)
      .map((k) => keyRecord(db, k)),
  )
})

/** Revokes an org key. Needs the org's manageSettings. */
export const revokeOrgKey = mutation((ctx, orgSlug: string, keyId: string): void => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  const can = orgScope(db, ctx, org).viewerCan.manageSettings
  if (!can.allowed) throw forbiddenError(can.reason!)
  const key = db.keys.find(
    (k) => k.id === keyId && k.level === 'organization' && k.orgId === org.id,
  )
  if (!key) throw notFoundError()
  db.keys = db.keys.filter((k) => k !== key)
})
