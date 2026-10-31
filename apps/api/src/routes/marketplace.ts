import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { recordAudit } from '../lib/audit.js'
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

  // The org's installs and how many workflows use each come from one statement.
  const [index, installed] = await Promise.all([
    remoteRegistry.getIndex(),
    db.listNodeUsage(organizationId),
  ])
  const installedById = new Map(installed.map((n) => [n.nodeId, n]))

  const nodes = index.nodes.map((node) => {
    const own = installedById.get(node.id)
    return {
      ...node,
      installed: own !== undefined,
      installedVersion: own?.version ?? null,
      // Workflows using it in their current version; null when not installed.
      usage: own?.usage ?? null,
      inRegistry: true,
    }
  })

  // Installed but no longer in the registry: listed from its bundle so it can still be removed.
  const listed = new Set(index.nodes.map((node) => node.id))
  const orphans = installed
    .filter((own) => !listed.has(own.nodeId))
    .map((own) => ({
      id: own.nodeId,
      name: own.name ?? own.nodeId,
      description: own.description ?? '',
      category: own.category ?? 'Other',
      tags: [],
      author: '',
      license: '',
      providers: [],
      latest: own.version,
      versions: [],
      installed: true,
      installedVersion: own.version,
      usage: own.usage,
      inRegistry: false,
    }))

  return c.json({ nodes: [...nodes, ...orphans] })
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
  await recordAudit(c, {
    event: 'node.install',
    facts: { name: nodeEntry.name, version: targetVersion },
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
  await recordAudit(c, {
    event: 'node.uninstall',
    facts: { name: installedNodeName(existing.bundle) ?? nodeId, version: existing.version },
  })
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
  await recordAudit(c, {
    event: 'node.update',
    facts: { name: nodeEntry.name, fromVersion: existing.version, version: targetVersion },
  })

  return c.json(updated)
})

/** The installed bundle's node name, for the audit log; null when it does not parse. */
function installedNodeName(bundle: string): string | null {
  try {
    const name = (JSON.parse(bundle) as { definition?: { name?: unknown } }).definition?.name
    return typeof name === 'string' ? name : null
  } catch {
    return null
  }
}
