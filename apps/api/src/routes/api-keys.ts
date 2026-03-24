import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { hashApiKey } from '../lib/api-key-hash.js'
import type { AppEnv } from '../types.js'

const VALID_SCOPES = ['read', 'write', 'deploy'] as const

const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  projectId: z.string().min(1),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1),
  expiresAt: z.string().datetime().nullable().optional(),
})

export const apiKeys = new Hono<AppEnv>()

apiKeys.get('/', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const keys = await db.listApiKeysByOrganization(organizationId)
  return c.json(keys.map(({ keyHash: _, ...key }) => key))
})

apiKeys.post('/', zValidator('json', createApiKeySchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const userId = c.get('userId')
  const body = c.req.valid('json')

  const project = await db.getProjectById(body.projectId)
  if (!project || project.organizationId !== organizationId) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const rawKey = `ask_${nanoid(40)}`
  const keyHash = await hashApiKey(rawKey)
  const keyPrefix = rawKey.slice(0, 8)

  const apiKey = await db.createApiKey({
    id: nanoid(),
    projectId: body.projectId,
    createdBy: userId,
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
  const organizationId = c.get('organizationId')
  const id = c.req.param('id')

  const apiKey = await db.getApiKeyById(id)
  if (!apiKey) return c.json({ error: 'Not found' }, 404)

  const project = await db.getProjectById(apiKey.projectId)
  if (!project || project.organizationId !== organizationId) {
    return c.json({ error: 'Not found' }, 404)
  }

  const revoked = await db.revokeApiKey(id, apiKey.projectId)
  if (!revoked) return c.json({ error: 'Not found' }, 404)

  const { keyHash: _, ...safeKey } = revoked
  return c.json(safeKey)
})
