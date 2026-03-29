import { Hono } from 'hono'
import type { AppEnv } from '../types.js'
import { createMergedNodeRegistry } from '../lib/node-registry.js'

export const nodes = new Hono<AppEnv>()

nodes.get('/', async (c) => {
  const nodeRegistry = c.get('nodeRegistry')
  const db = c.get('db')
  const organizationId = c.req.query('organizationId')

  if (!organizationId) {
    if (!nodeRegistry) return c.json([])
    return c.json(nodeRegistry.registry.getAll())
  }

  const installed = (await db.listInstalledNodes(organizationId, { limit: 100 })).data
  const merged = createMergedNodeRegistry(nodeRegistry, installed)
  return c.json(merged.registry.getAll())
})

nodes.get('/templates', async (c) => {
  const nodeRegistry = c.get('nodeRegistry')
  const db = c.get('db')
  const organizationId = c.req.query('organizationId')

  if (!organizationId) {
    if (!nodeRegistry) return c.json({})
    return c.json(nodeRegistry.templates)
  }

  const installed = (await db.listInstalledNodes(organizationId, { limit: 100 })).data
  const merged = createMergedNodeRegistry(nodeRegistry, installed)
  return c.json(merged.templates)
})

nodes.get('/:nodeId', (c) => {
  const nodeRegistry = c.get('nodeRegistry')
  if (!nodeRegistry) return c.json({ error: 'Node definition not found' }, 404)
  const def = nodeRegistry.registry.get(c.req.param('nodeId'))
  if (!def) return c.json({ error: 'Node definition not found' }, 404)
  return c.json(def)
})
