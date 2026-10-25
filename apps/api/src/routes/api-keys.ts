import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import type { AppEnv } from '../types.js'

const VALID_SCOPES = ['read', 'write', 'deploy'] as const

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  /** With a projectId the key is project-level; without, organization-level. */
  projectId: z.string().min(1).optional(),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1),
  expiresAt: z.string().datetime().nullable().optional(),
})

export const apiKeys = new Hono<AppEnv>()

apiKeys.get('/', zValidator('query', paginationQuerySchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const { cursor, limit } = c.req.valid('query')
  const result = await db.listApiKeysByOrganization(organizationId, { cursor, limit })
  return c.json({
    data: result.data.map(({ keyHash: _, ...key }) => key),
    nextCursor: result.nextCursor,
  })
})

apiKeys.post('/', zValidator('json', createApiKeySchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const userId = c.get('userId')
  const body = c.req.valid('json')

  // A key never mints past itself: not its own level (one leaked key must not
  // be self-replicating), not scopes it does not hold, not a longer life.
  const callerScopes = c.get('apiKeyScopes')
  let expiresAt = body.expiresAt ?? null
  if (callerScopes !== null) {
    if (!body.projectId) {
      return c.json({ error: 'An API key cannot create organization-level keys' }, 403)
    }
    const escalated = body.scopes.filter((s) => !callerScopes.includes(s))
    if (escalated.length > 0) {
      return c.json(
        { error: `A key cannot grant scopes it does not hold: ${escalated.join(', ')}` },
        403,
      )
    }
    const callerExpiresAt = c.get('apiKeyExpiresAt')
    if (callerExpiresAt && (!expiresAt || expiresAt > callerExpiresAt)) {
      expiresAt = callerExpiresAt
    }
  }

  const rawKey = `ask_${nanoid(40)}`
  const keyHash = await hashApiKey(rawKey)
  const keyPrefix = rawKey.slice(0, 8)

  // The adapter validates the project belongs to the organization and stores
  // exactly one level, in one call.
  const apiKey = await db.createApiKey({
    id: nanoid(),
    organizationId,
    projectId: body.projectId ?? null,
    createdBy: userId,
    name: body.name,
    keyHash,
    keyPrefix,
    scopes: JSON.stringify(body.scopes),
    expiresAt,
  })
  if (!apiKey) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const { keyHash: _, ...safeKey } = apiKey
  return c.json({ ...safeKey, key: rawKey }, 201)
})

apiKeys.delete('/:id', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const id = c.req.param('id')

  const revoked = await db.revokeApiKey(id, organizationId)
  if (!revoked) return c.json({ error: 'Not found' }, 404)

  const { keyHash: _, ...safeKey } = revoked
  return c.json(safeKey)
})
