import { Hono, type Context } from 'hono'
import type { NodeBundle } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'
import { createMergedNodeRegistry, type AppNodeRegistry } from '../lib/node-registry.js'

export const nodes = new Hono<AppEnv>()

/**
 * The registry this caller sees: the public one, plus the organization's
 * installed nodes when there is an organization in context. That context was
 * set by resolveOptionalOrganization — membership checked, or the key's own —
 * never read from a query parameter here.
 */
async function callerRegistry(c: Context<AppEnv>): Promise<AppNodeRegistry | undefined> {
  const base = c.get('nodeRegistry')
  const organizationId = c.get('organizationId') as string | undefined
  if (!organizationId) return base
  const installed = (await c.get('db').listInstalledNodes(organizationId, { limit: 100 })).data
  return createMergedNodeRegistry(base, installed)
}

nodes.get('/', async (c) => {
  const registry = await callerRegistry(c)
  return c.json(registry?.registry.getAll() ?? [])
})

nodes.get('/templates', async (c) => {
  const registry = await callerRegistry(c)
  return c.json(registry?.templates ?? {})
})

// One node: the public registry, then one indexed row of the organization's
// installs — not a whole registry rebuilt to find a single id. An install
// shadows a builtin of the same id in the merged registry, so it wins here too.
nodes.get('/:nodeId', async (c) => {
  const nodeId = c.req.param('nodeId')
  const organizationId = c.get('organizationId') as string | undefined
  if (organizationId) {
    const installed = await c.get('db').getInstalledNode(organizationId, nodeId)
    if (installed) return c.json((JSON.parse(installed.bundle) as NodeBundle).definition)
  }
  const def = c.get('nodeRegistry')?.registry.get(nodeId)
  if (!def) return c.json({ error: 'Node definition not found' }, 404)
  return c.json(def)
})
