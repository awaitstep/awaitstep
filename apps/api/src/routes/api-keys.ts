import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import type { AppEnv } from '../types.js'

const VALID_SCOPES = ['read', 'write', 'deploy'] as const

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1),
  expiresAt: z.string().datetime().nullable().optional(),
})

export const apiKeys = new Hono<AppEnv>()

apiKeys.get('/', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const keys = await db.listApiKeysByUser(userId)
  return c.json(
    keys.map(({ keyHash: _, ...key }) => key),
  )
})

apiKeys.post('/', zValidator('json', createApiKeySchema), async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const body = c.req.valid('json')

  const rawKey = `ask_${nanoid(40)}`
  const keyHash = await hashApiKey(rawKey)
  const keyPrefix = rawKey.slice(0, 8)

  const apiKey = await db.createApiKey({
    id: nanoid(),
    userId,
    name: body.name,
    keyHash,
    keyPrefix,
    scopes: JSON.stringify(body.scopes),
    expiresAt: body.expiresAt ?? null,
  })

  const { keyHash: _, ...safeKey } = apiKey
  return c.json({ ...safeKey, key: rawKey }, 201)
})

apiKeys.delete('/:id', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const id = c.req.param('id')

  const revoked = await db.revokeApiKey(id, userId)
  if (!revoked) return c.json({ error: 'Not found' }, 404)

  const { keyHash: _, ...safeKey } = revoked
  return c.json(safeKey)
})
