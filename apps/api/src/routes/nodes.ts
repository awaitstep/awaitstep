import { Hono } from 'hono'
import type { AppEnv } from '../types.js'

export const nodes = new Hono<AppEnv>()

nodes.get('/', (c) => {
  const nodeRegistry = c.get('nodeRegistry')
  if (!nodeRegistry) return c.json([])
  return c.json(nodeRegistry.registry.getAll())
})

nodes.get('/templates', (c) => {
  const nodeRegistry = c.get('nodeRegistry')
  if (!nodeRegistry) return c.json({})
  return c.json(nodeRegistry.templates)
})

nodes.get('/:nodeId', (c) => {
  const nodeRegistry = c.get('nodeRegistry')
  if (!nodeRegistry) return c.json({ error: 'Node definition not found' }, 404)
  const def = nodeRegistry.registry.get(c.req.param('nodeId'))
  if (!def) return c.json({ error: 'Node definition not found' }, 404)
  return c.json(def)
})
