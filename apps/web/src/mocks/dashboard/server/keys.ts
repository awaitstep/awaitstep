import type {
  ApiKey,
  CreatedKey,
  NewKeyInput,
  ProjectKeys,
  WorkspaceKeys,
} from '../../../types/dashboard/api-keys'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import { getDb, type KeyRow, type MockDb } from '../db'
import { endpoint, invalidError, mutation, notFoundError, rows } from '../scenario'
import { workspaceRef } from './item-records'
import { personById, visibleWorkspaces } from './records'
import { newId, requireScope } from './resolve'
import { requireLevel } from './levels'
import { grantsOutsideLevel } from '../../../components/keys/parts/key-permissions'
import type { LevelSlugs } from '../../../types/dashboard/scope'
import type { MockContext } from '../scenario'

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

/** Removes one key at `slugs`' level, after checking the viewer manages keys there. */
function revoke(ctx: MockContext, orgSlug: string, slugs: LevelSlugs, keyId: string): void {
  const db = getDb()
  const at = requireLevel(db, ctx, orgSlug, slugs, 'keys')
  const key = db.keys.find(
    (k) =>
      k.id === keyId &&
      k.level === at.level &&
      (at.level === 'organization'
        ? k.orgId === at.target.id
        : at.level === 'project'
          ? k.projectId === at.target.id
          : k.workspaceId === at.target.id),
  )
  if (!key) throw notFoundError()
  db.keys = db.keys.filter((k) => k !== key)
}

/** Revokes a project key. Needs the project's manageKeys. */
export const revokeProjectKey = mutation(
  (ctx, orgSlug: string, projectSlug: string, keyId: string): void =>
    revoke(ctx, orgSlug, { level: 'project', project: projectSlug }, keyId),
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
  (ctx, slugs: Required<ScopeSlugs>, keyId: string): void =>
    revoke(
      ctx,
      slugs.org,
      { level: 'workspace', project: slugs.project, workspace: slugs.workspace },
      keyId,
    ),
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

/**
 * Create an API key at any level. The secret comes back this once; only its
 * prefix is kept (D-P6-2).
 */
export const createKey = mutation((ctx, orgSlug: string, input: NewKeyInput): CreatedKey => {
  const db = getDb()
  const name = input.name.trim()
  if (!name) throw invalidError('Give the key a name', 'name')
  const at = requireLevel(db, ctx, orgSlug, input, 'keys')
  if (!(input.expires in EXPIRY_DAYS)) throw invalidError('Pick when it expires', 'expires')
  const granted = Object.values(input.permissions).some((actions) => actions && actions.length > 0)
  if (!granted) throw invalidError('Pick at least one permission', 'permissions')
  const outside = grantsOutsideLevel(input.level, input.permissions)
  if (outside.length > 0) {
    throw invalidError(`Not available on this kind of key: ${outside.join(', ')}`, 'permissions')
  }
  const secret = secretFor()
  const days = EXPIRY_DAYS[input.expires]
  const now = new Date()
  const row: KeyRow = {
    id: newId('key'),
    level: input.level,
    orgId: at.org.id,
    projectId: at.level === 'organization' ? null : at.project.id,
    workspaceId: at.level === 'workspace' ? at.workspace.id : null,
    name,
    prefix: `${secret.slice(0, 8)}…${secret.slice(-4)}`,
    permissions: input.permissions,
    createdBy: ctx.userId,
    createdAt: now.toISOString(),
    lastUsedAt: null,
    expiresAt: days === null ? null : new Date(now.getTime() + days * 86_400_000).toISOString(),
  }
  db.keys.unshift(row)
  return { key: keyRecord(db, row), secret }
})
