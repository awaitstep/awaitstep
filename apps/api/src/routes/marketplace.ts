import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import type { AppEnv } from '../types.js'

const nodeIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/, 'Invalid node ID')

const versionSchema = z
  .string()
  .max(50)
  .regex(/^\d+\.\d+\.\d+$/, 'Invalid version (expected semver)')

const installSchema = z.object({
  nodeId: nodeIdSchema,
  version: versionSchema.optional(),
})

const uninstallSchema = z.object({
  nodeId: nodeIdSchema,
})

const updateSchema = z.object({
  nodeId: nodeIdSchema,
  version: versionSchema.optional(),
})

export const marketplace = new Hono<AppEnv>()

marketplace.get('/installed', zValidator('query', paginationQuerySchema), async (c) => {
  const organizationId = c.get('organizationId')
  const db = c.get('db')
  const { cursor, limit } = c.req.valid('query')
  const result = await db.listInstalledNodes(organizationId, { cursor, limit })
  return c.json(result)
})

marketplace.get('/', async (c) => {
  const remoteRegistry = c.get('remoteNodeRegistry')
  if (!remoteRegistry) return c.json({ error: 'Node registry not configured' }, 503)

  const organizationId = c.get('organizationId')
  const db = c.get('db')

  const [index, installedResult] = await Promise.all([
    remoteRegistry.getIndex(),
    db.listInstalledNodes(organizationId, { limit: 100 }),
  ])

  const installedMap = new Map(installedResult.data.map((n) => [n.nodeId, n.version]))

  const nodes = index.nodes.map((node) => ({
    ...node,
    installed: installedMap.has(node.id),
    installedVersion: installedMap.get(node.id) ?? null,
  }))

  return c.json({ nodes })
})

marketplace.get('/:nodeId', async (c) => {
  const remoteRegistry = c.get('remoteNodeRegistry')
  if (!remoteRegistry) return c.json({ error: 'Node registry not configured' }, 503)

  const index = await remoteRegistry.getIndex()
  const node = index.nodes.find((n) => n.id === c.req.param('nodeId'))
  if (!node) return c.json({ error: 'Node not found in registry' }, 404)

  const organizationId = c.get('organizationId')
  const db = c.get('db')
  const installed = await db.getInstalledNode(organizationId, node.id)

  return c.json({
    ...node,
    installed: !!installed,
    installedVersion: installed?.version ?? null,
  })
})

marketplace.post('/install', zValidator('json', installSchema), async (c) => {
  const remoteRegistry = c.get('remoteNodeRegistry')
  if (!remoteRegistry) return c.json({ error: 'Node registry not configured' }, 503)

  const organizationId = c.get('organizationId')
  const userId = c.get('userId')
  const db = c.get('db')
  const { nodeId, version } = c.req.valid('json')

  const existing = await db.getInstalledNode(organizationId, nodeId)
  if (existing) return c.json({ error: 'Node already installed' }, 409)

  const index = await remoteRegistry.getIndex()
  const nodeEntry = index.nodes.find((n) => n.id === nodeId)
  if (!nodeEntry) return c.json({ error: 'Node not found in registry' }, 404)

  const targetVersion = version ?? nodeEntry.latest
  if (!nodeEntry.versions.some((v) => v.version === targetVersion)) {
    return c.json({ error: `Version ${targetVersion} not found` }, 404)
  }

  const bundle = await remoteRegistry.getNodeBundle(nodeId, targetVersion)

  const installed = await db.installNode({
    id: nanoid(),
    organizationId,
    nodeId,
    version: targetVersion,
    bundle: JSON.stringify(bundle),
    installedBy: userId,
  })

  return c.json(installed, 201)
})

marketplace.post('/uninstall', zValidator('json', uninstallSchema), async (c) => {
  const organizationId = c.get('organizationId')
  const db = c.get('db')
  const { nodeId } = c.req.valid('json')

  const existing = await db.getInstalledNode(organizationId, nodeId)
  if (!existing) return c.json({ error: 'Node not installed' }, 404)

  await db.uninstallNode(organizationId, nodeId)
  return c.json({ ok: true })
})

marketplace.post('/update', zValidator('json', updateSchema), async (c) => {
  const remoteRegistry = c.get('remoteNodeRegistry')
  if (!remoteRegistry) return c.json({ error: 'Node registry not configured' }, 503)

  const organizationId = c.get('organizationId')
  const db = c.get('db')
  const { nodeId, version } = c.req.valid('json')

  const existing = await db.getInstalledNode(organizationId, nodeId)
  if (!existing) return c.json({ error: 'Node not installed' }, 404)

  const index = await remoteRegistry.getIndex()
  const nodeEntry = index.nodes.find((n) => n.id === nodeId)
  if (!nodeEntry) return c.json({ error: 'Node not found in registry' }, 404)

  const targetVersion = version ?? nodeEntry.latest
  if (!nodeEntry.versions.some((v) => v.version === targetVersion)) {
    return c.json({ error: `Version ${targetVersion} not found` }, 404)
  }

  if (existing.version === targetVersion) {
    return c.json({ error: 'Already on this version' }, 409)
  }

  const bundle = await remoteRegistry.getNodeBundle(nodeId, targetVersion)

  const updated = await db.updateInstalledNodeBundle(organizationId, nodeId, {
    version: targetVersion,
    bundle: JSON.stringify(bundle),
  })

  return c.json(updated)
})
