import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import {
  KEY_LEVELS,
  countGrants,
  grantsOutsideLevel,
  keyLevelOf,
  keyScopesOf,
  normalisePermissions,
  parseKeyPermissions,
  type KeyLevel,
} from '@awaitstep/ir'
import type { ApiKey, ApiKeyListItem, ApiKeyTarget, CreateApiKeyData } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import { addressedLevel, levelCan } from '../middleware/level.js'
import type { AppEnv } from '../types.js'

// API keys at three levels (B3). Session-only, addressed at the level they
// manage — `?org=`, `&project=`, `&workspace=` — which the router resolved
// with the caller's roles: an organization key is minted, listed and
// revoked by the org's owners and admins; a project key by its project's
// admins; a workspace key by that workspace's admins. Anyone who can open a
// project or workspace sees its keys (never the secret).

const SECRET_LENGTH = 40
const PREFIX_LENGTH = 8
const SUFFIX_LENGTH = 4

const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(255),
  level: z.enum(KEY_LEVELS as [KeyLevel, ...KeyLevel[]]),
  /** The grid: `{ "<resource>": ["<action>", …] }`, cells the level offers. */
  permissions: z.record(z.string(), z.array(z.string())),
  // A key minted already expired would answer 401 to its first call.
  expiresAt: z
    .string()
    .datetime()
    .refine((value) => Date.parse(value) > Date.now(), 'expiresAt must be in the future')
    .nullable()
    .optional(),
})

function targetOf(c: Context<AppEnv>, level: KeyLevel): ApiKeyTarget {
  if (level === 'workspace') return { level, workspaceId: c.get('workspaceId')! }
  if (level === 'project') return { level, projectId: c.get('projectId') }
  return { level, organizationId: c.get('organizationId') }
}

/** A key as the keys pages read it: no hash, the grid as an object, its level. */
function keyRecord(key: ApiKey | ApiKeyListItem) {
  const { keyHash: _, scopes: __, permissions, ...rest } = key
  return {
    ...rest,
    level: keyLevelOf(key),
    permissions: parseKeyPermissions(permissions) ?? {},
  }
}

export const apiKeys = new Hono<AppEnv>()

/**
 * The keys of the addressed level: `?org=` the organization's own (owners
 * and admins), `&project=` the project's own with a count per workspace the
 * caller can open, `&workspace=` the workspace's own and the project keys
 * that reach it.
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
  if (level === 'project') {
    const projectId = c.get('projectId')
    const [result, workspaceCounts] = await Promise.all([
      db.listApiKeysByProject(
        c.get('organizationId'),
        projectId,
        { cursor, limit },
        c.get('userId'),
      ),
      db.countApiKeysByWorkspace(projectId, c.get('userId')),
    ])
    return c.json({
      data: result.data.map(keyRecord),
      nextCursor: result.nextCursor,
      workspaceCounts,
    })
  }
  const rows = await db.listApiKeysByWorkspace(c.get('workspaceId')!, new Date().toISOString())
  return c.json({ own: rows.own.map(keyRecord), inherited: rows.inherited.map(keyRecord) })
})

/**
 * Mint a key at the addressed level, with the grid the level offers; the
 * secret is returned once, here, and never again.
 */
apiKeys.post('/', zValidator('json', createApiKeySchema), async (c) => {
  const db = c.get('db')
  const level = addressedLevel(c)
  const body = c.req.valid('json')
  if (body.level !== level) {
    return c.json(
      { error: `Address the ${body.level} the key is for (?org=, &project=, &workspace=)` },
      400,
    )
  }
  const can = levelCan(c, 'manageKeys')
  if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)

  const invalid = (message: string) =>
    c.json({ error: 'Validation failed', details: [{ path: 'permissions', message }] }, 422)
  const permissions = parseKeyPermissions(body.permissions)
  if (!permissions) return invalid('Unknown resource or action')
  const outside = grantsOutsideLevel(level, permissions)
  if (outside.length > 0) {
    return invalid(`Not available on this kind of key: ${outside.join(', ')}`)
  }
  const grid = normalisePermissions(level, permissions)
  if (countGrants(level, grid) === 0) return invalid('Pick at least one permission')

  const rawKey = `ask_${nanoid(SECRET_LENGTH)}`
  const common = {
    id: nanoid(),
    createdBy: c.get('userId'),
    name: body.name,
    keyHash: await hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, PREFIX_LENGTH),
    keySuffix: rawKey.slice(-SUFFIX_LENGTH),
    permissions: JSON.stringify(grid),
    scopes: JSON.stringify(keyScopesOf(level, grid)),
    expiresAt: body.expiresAt ?? null,
  }
  const organizationId = c.get('organizationId')
  const data: CreateApiKeyData =
    level === 'organization'
      ? { ...common, level, organizationId }
      : level === 'project'
        ? { ...common, level, organizationId, projectId: c.get('projectId') }
        : {
            ...common,
            level,
            organizationId,
            projectId: c.get('projectId'),
            workspaceId: c.get('workspaceId')!,
          }
  // The insert itself checks the place is the organization's and the
  // creator can open it. The answer is the listed shape — the workspace
  // chip and the creator's name come from the scope read and the session,
  // so the reveal says "Only Sales", not "Only ." — plus the secret, once.
  const apiKey = await db.createApiKey(data)
  if (!apiKey) return c.json({ error: 'Not found' }, 404)
  const listed: ApiKeyListItem = {
    ...apiKey,
    projectName: null,
    createdByName: c.get('user')?.name ?? null,
    workspace: level === 'workspace' ? (c.get('workspace') ?? null) : null,
  }
  return c.json({ ...keyRecord(listed), key: rawKey }, 201)
})

/** Revoke a key of the addressed level — the statement holds it to that level's place. */
apiKeys.delete('/:id', async (c) => {
  const level = addressedLevel(c)
  const can = levelCan(c, 'manageKeys')
  if (!can.allowed) return c.json({ error: can.reason ?? 'Forbidden' }, 403)
  const revoked = await c.get('db').revokeApiKey(c.req.param('id'), targetOf(c, level))
  if (!revoked) return c.json({ error: 'Not found' }, 404)
  return c.json(keyRecord(revoked))
})
