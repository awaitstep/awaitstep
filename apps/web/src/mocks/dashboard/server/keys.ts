import type { ApiKey, ProjectKeys } from '../../../types/dashboard/api-keys'
import { getDb, type KeyRow, type MockDb } from '../db'
import { endpoint, forbiddenError, mutation, notFoundError, rows } from '../scenario'
import { workspaceRef } from './item-records'
import { personById, projectScope, visibleWorkspaces } from './records'
import { requireScope } from './resolve'

// API keys, listed and revoked. Creating them is P6.

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
