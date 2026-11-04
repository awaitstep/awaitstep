import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import {
  KEY_LEVELS,
  countGrants,
  describeKeyGrid,
  grantsOutsideLevel,
  keyScopesOf,
  normalisePermissions,
  orgCapabilities,
  parseKeyPermissions,
  type KeyLevel,
} from '@awaitstep/ir'
import type {
  ApiKey,
  ApiKeyListItem,
  ApiKeyScopeTarget,
  ApiKeyTarget,
  CreateApiKeyData,
} from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import { addressedLevel, levelCan } from '../middleware/level.js'
import { recordAudit, type AuditRecord } from '../lib/audit.js'
import type { AppEnv } from '../types.js'

// Multi-scope API keys. Session-only, addressed at the HOME level they are
// managed from — `?org=`, `&project=`, `&workspace=` — which the router
// resolved with the caller's roles. One key (one secret) reaches a SET: an
// organization key the whole org; a project-level key a set of projects (one,
// or several picked at the org); a workspace-level key a set of workspaces of
// one project (one, or several picked at the project). Each consumer revokes
// its own slice; the owner's kill-switch revokes the whole key at once.

const SECRET_LENGTH = 40
const PREFIX_LENGTH = 8
const SUFFIX_LENGTH = 4

const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(255),
  level: z.enum(KEY_LEVELS as [KeyLevel, ...KeyLevel[]]),
  /** The grid: `{ "<resource>": ["<action>", …] }`, cells the level offers. */
  permissions: z.record(z.string(), z.array(z.string())),
  /** A project-level key's projects — several only when created at the organization. */
  projectIds: z.array(z.string().min(1)).optional(),
  /** A workspace-level key's workspaces — several only when created at the project. */
  workspaceIds: z.array(z.string().min(1)).optional(),
  // A key minted already expired would answer 401 to its first call.
  expiresAt: z
    .string()
    .datetime()
    .refine((value) => Date.parse(value) > Date.now(), 'expiresAt must be in the future')
    .nullable()
    .optional(),
})

/** The whole-key kill-switch target: the key's home is the addressed level. */
function targetOf(c: Context<AppEnv>, level: KeyLevel): ApiKeyTarget {
  if (level === 'workspace') return { level, workspaceId: c.get('workspaceId')! }
  if (level === 'project') return { level, projectId: c.get('projectId') }
  return { level, organizationId: c.get('organizationId') }
}

/** A key as the keys pages read it: no hash, the grid as an object, and its scope set. */
function keyRecord(key: ApiKey | ApiKeyListItem) {
  const { keyHash: _hash, scopes: _scopes, permissions, ...rest } = key
  return {
    ...rest,
    permissions: parseKeyPermissions(permissions) ?? {},
    projects: 'projects' in key ? key.projects : [],
    workspaces: 'workspaces' in key ? key.workspaces : [],
  }
}

/** Where a key event is recorded: the home level the key belongs to. */
function auditPlace(
  c: Context<AppEnv>,
  level: KeyLevel,
): Pick<AuditRecord, 'projectId' | 'workspaceId'> {
  if (level === 'organization') return {}
  return {
    projectId: c.get('projectId'),
    workspaceId: level === 'workspace' ? c.get('workspaceId') : null,
  }
}

export const apiKeys = new Hono<AppEnv>()

/**
 * The keys of the addressed level: `?org=` the organization's own keys and
 * its multi-project keys (paged); `&project=` the project's own keys, the keys
 * reaching it, and a count per workspace the caller can open; `&workspace=`
 * the workspace's own keys and the keys reaching it.
 */
apiKeys.get('/', zValidator('query', paginationQuerySchema), async (c) => {
  const db = c.get('db')
  const level = addressedLevel(c)
  const { cursor, limit } = c.req.valid('query')
  if (level === 'organization') {
    const can = levelCan(c, 'manageKeys')
    if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
    const result = await db.listApiKeysByOrganization(c.get('organizationId'), { cursor, limit })
    return c.json({ data: result.data.map(keyRecord), nextCursor: result.nextCursor })
  }
  // An organization admin sees a reaching bundle's whole scope set; a mere
  // project/workspace admin sees only the slice reaching the place they manage.
  const orgRole = c.get('orgRole')
  const fullReach = !!orgRole && orgCapabilities(orgRole).manageSettings.allowed
  const now = new Date().toISOString()
  if (level === 'project') {
    const projectId = c.get('projectId')
    const [rows, workspaceCounts] = await Promise.all([
      db.listApiKeysByProject(c.get('organizationId'), projectId, c.get('userId'), fullReach, now),
      db.countApiKeysByWorkspace(projectId, c.get('userId')),
    ])
    return c.json({
      own: rows.own.map(keyRecord),
      reaching: rows.reaching.map(keyRecord),
      workspaceCounts,
    })
  }
  const rows = await db.listApiKeysByWorkspace(c.get('workspaceId')!, now, fullReach)
  return c.json({ own: rows.own.map(keyRecord), reaching: rows.reaching.map(keyRecord) })
})

/**
 * Mint a key at the addressed home level, with the grid the level offers and
 * the scope set it reaches. The secret is returned once, here, and never
 * again. The adapter writes the key and all its scope rows as one unit, only
 * if the creator can open every scope (all-or-nothing).
 */
apiKeys.post('/', zValidator('json', createApiKeySchema), async (c) => {
  const db = c.get('db')
  const addressed = addressedLevel(c)
  const body = c.req.valid('json')
  const can = levelCan(c, 'manageKeys')
  if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)

  const invalid = (message: string) =>
    c.json({ error: 'Validation failed', details: [{ path: 'permissions', message }] }, 422)
  const permissions = parseKeyPermissions(body.permissions)
  if (!permissions) return invalid('Unknown resource or action')
  const outside = grantsOutsideLevel(body.level, permissions)
  if (outside.length > 0) {
    return invalid(`Not available on this kind of key: ${outside.join(', ')}`)
  }
  const grid = normalisePermissions(body.level, permissions)
  if (countGrants(body.level, grid) === 0) return invalid('Pick at least one permission')

  const organizationId = c.get('organizationId')
  const rawKey = `ask_${nanoid(SECRET_LENGTH)}`
  const common = {
    id: nanoid(),
    createdBy: c.get('userId'),
    name: body.name,
    keyHash: await hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, PREFIX_LENGTH),
    keySuffix: rawKey.slice(-SUFFIX_LENGTH),
    permissions: JSON.stringify(grid),
    scopes: JSON.stringify(keyScopesOf(body.level, grid)),
    expiresAt: body.expiresAt ?? null,
  }

  const addressError = (message: string) => c.json({ error: message }, 400)
  let data: CreateApiKeyData
  if (body.level === 'organization') {
    if (addressed !== 'organization') return addressError('Address the organization for an org key')
    data = { ...common, level: 'organization', organizationId }
  } else if (body.level === 'project') {
    // A project key spans projects only when created at the organization; at a
    // project it is for that project alone.
    let projectIds: string[]
    if (addressed === 'project') projectIds = [c.get('projectId')]
    else if (addressed === 'organization') {
      projectIds = [...new Set(body.projectIds ?? [])]
      if (projectIds.length === 0) return addressError('Pick at least one project')
    } else return addressError('Address the organization or a project for a project key')
    data = { ...common, level: 'project', organizationId, projectIds }
  } else {
    // A workspace key spans workspaces only when created at the project; at a
    // workspace it is for that workspace alone. Its workspaces are that
    // project's.
    let workspaceIds: string[]
    let projectId: string
    if (addressed === 'workspace') {
      projectId = c.get('projectId')
      workspaceIds = [c.get('workspaceId')!]
    } else if (addressed === 'project') {
      projectId = c.get('projectId')
      workspaceIds = [...new Set(body.workspaceIds ?? [])]
      if (workspaceIds.length === 0) return addressError('Pick at least one workspace')
    } else return addressError('Address a project or a workspace for a workspace key')
    data = { ...common, level: 'workspace', organizationId, projectId, workspaceIds }
  }

  const apiKey = await db.createApiKey(data)
  if (!apiKey) {
    return c.json({ error: 'A scope is not in this organization, or you cannot open it' }, 403)
  }
  await recordAudit(c, {
    event: 'api_key.create',
    facts: { name: body.name, summary: describeKeyGrid(grid) },
    ...auditPlace(c, addressed),
  })
  // The reveal carries the secret once; the scope set is returned as ids (the
  // keys page refetches the named rows), so a freshly minted key renders like
  // a listed one.
  const listed: ApiKeyListItem = {
    ...apiKey,
    createdByName: c.get('user')?.name ?? null,
    projects:
      data.level === 'project'
        ? data.projectIds.map((projectId) => ({
            projectId,
            projectName: null,
            projectSlug: null,
            revokedAt: null,
          }))
        : [],
    workspaces:
      data.level === 'workspace'
        ? data.workspaceIds.map((id) => ({
            workspace: c.get('workspace') ?? { id, slug: '', name: '', colour: 'green' },
            revokedAt: null,
          }))
        : [],
  }
  return c.json({ ...keyRecord(listed), key: rawKey }, 201)
})

/**
 * The whole-key kill-switch: the owner revokes every scope at once, from the
 * key's home level. A project or workspace page uses it only on the keys that
 * live there; a key reaching in from elsewhere is dropped a slice at a time
 * (`DELETE /:id/scope`).
 */
apiKeys.delete('/:id', async (c) => {
  const level = addressedLevel(c)
  const can = levelCan(c, 'manageKeys')
  if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
  const revoked = await c.get('db').revokeApiKey(c.req.param('id'), targetOf(c, level))
  if (!revoked) return c.json({ error: 'Not found' }, 404)
  await recordAudit(c, {
    event: 'api_key.revoke',
    facts: { name: revoked.name },
    ...auditPlace(c, level),
  })
  return c.json(keyRecord(revoked))
})

/**
 * Per-consumer revoke: the addressed project or workspace drops its own slice
 * of a shared key without touching the others. When it is the key's last live
 * slice, the key is stamped dead too. Addressed at a project or a workspace,
 * by its admins.
 */
apiKeys.delete('/:id/scope', async (c) => {
  const level = addressedLevel(c)
  if (level === 'organization') {
    return c.json({ error: 'Revoke an organization key with DELETE /:id' }, 400)
  }
  const can = levelCan(c, 'manageKeys')
  if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
  const target: ApiKeyScopeTarget =
    level === 'workspace'
      ? { level, keyId: c.req.param('id'), workspaceId: c.get('workspaceId')! }
      : { level, keyId: c.req.param('id'), projectId: c.get('projectId') }
  const revoked = await c.get('db').revokeApiKeyScope(target)
  if (!revoked) return c.json({ error: 'Not found' }, 404)
  await recordAudit(c, {
    event: 'api_key.revoke',
    facts: { name: revoked.name },
    ...auditPlace(c, level),
  })
  return c.json(keyRecord(revoked))
})
