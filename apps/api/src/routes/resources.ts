import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '../lib/validation.js'
import { CloudflareResourcesAPI } from '@awaitstep/provider-cloudflare'
import type { AppEnv } from '../types.js'

const connectionQuery = z.object({
  connectionId: z.string().min(1),
})

const kvKeysQuery = z.object({
  connectionId: z.string().min(1),
  prefix: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).optional(),
})

const d1QueryBody = z.object({
  connectionId: z.string().min(1),
  sql: z.string().min(1),
  params: z.array(z.unknown()).optional(),
})

const r2ObjectsQuery = z.object({
  connectionId: z.string().min(1),
  prefix: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).optional(),
})

export const resources = new Hono<AppEnv>()

async function getResourcesAPI(
  db: AppEnv['Variables']['db'],
  organizationId: string,
  connectionId: string,
): Promise<CloudflareResourcesAPI | null> {
  const connection = await db.getProviderConnectionById(connectionId)
  if (!connection || connection.organizationId !== organizationId) return null
  const creds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  return new CloudflareResourcesAPI(creds)
}

// ── KV ──

resources.get('/kv/namespaces', zValidator('query', connectionQuery), async (c) => {
  const { connectionId } = c.req.valid('query')
  const api = await getResourcesAPI(c.get('db'), c.get('organizationId'), connectionId)
  if (!api) return c.json({ error: 'Connection not found' }, 404)

  const namespaces = await api.listKVNamespaces()
  return c.json(namespaces)
})

resources.get('/kv/namespaces/:namespaceId/keys', zValidator('query', kvKeysQuery), async (c) => {
  const { connectionId, prefix, cursor, limit } = c.req.valid('query')
  const api = await getResourcesAPI(c.get('db'), c.get('organizationId'), connectionId)
  if (!api) return c.json({ error: 'Connection not found' }, 404)

  const result = await api.listKVKeys(c.req.param('namespaceId'), { prefix, cursor, limit })
  return c.json(result)
})

resources.get(
  '/kv/namespaces/:namespaceId/values/:key',
  zValidator('query', connectionQuery),
  async (c) => {
    const { connectionId } = c.req.valid('query')
    const api = await getResourcesAPI(c.get('db'), c.get('organizationId'), connectionId)
    if (!api) return c.json({ error: 'Connection not found' }, 404)

    const value = await api.getKVValue(c.req.param('namespaceId'), c.req.param('key'))
    return c.json({ value })
  },
)

// ── D1 ──

resources.get('/d1/databases', zValidator('query', connectionQuery), async (c) => {
  const { connectionId } = c.req.valid('query')
  const api = await getResourcesAPI(c.get('db'), c.get('organizationId'), connectionId)
  if (!api) return c.json({ error: 'Connection not found' }, 404)

  const databases = await api.listD1Databases()
  return c.json(databases)
})

resources.post('/d1/databases/:databaseId/query', zValidator('json', d1QueryBody), async (c) => {
  const { connectionId, sql, params } = c.req.valid('json')
  const api = await getResourcesAPI(c.get('db'), c.get('organizationId'), connectionId)
  if (!api) return c.json({ error: 'Connection not found' }, 404)

  const result = await api.queryD1(c.req.param('databaseId'), sql, params)
  return c.json(result)
})

// ── R2 ──

resources.get('/r2/buckets', zValidator('query', connectionQuery), async (c) => {
  const { connectionId } = c.req.valid('query')
  const api = await getResourcesAPI(c.get('db'), c.get('organizationId'), connectionId)
  if (!api) return c.json({ error: 'Connection not found' }, 404)

  const buckets = await api.listR2Buckets()
  return c.json(buckets)
})

resources.get('/r2/buckets/:bucketName/objects', zValidator('query', r2ObjectsQuery), async (c) => {
  const { connectionId, prefix, cursor, limit } = c.req.valid('query')
  const api = await getResourcesAPI(c.get('db'), c.get('organizationId'), connectionId)
  if (!api) return c.json({ error: 'Connection not found' }, 404)

  const result = await api.listR2Objects(c.req.param('bucketName'), { prefix, cursor, limit })
  return c.json(result)
})
