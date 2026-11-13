import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { recordAudit } from '../lib/audit.js'
import { createLogger } from '../lib/logger.js'
import { RegistryBundleError } from '../lib/remote-node-registry.js'
import type { AppEnv } from '../types.js'

const log = createLogger('marketplace')

/**
 * What the registry answered, or the sentence to answer with when it couldn't
 * hand over something usable (unreachable, invalid, not matching its index);
 * the detail goes to the log. Any other error is the server's own and throws.
 */
async function fromRegistry<T>(
  work: () => Promise<T>,
): Promise<{ value: T } | { refusal: string }> {
  try {
    return { value: await work() }
  } catch (err) {
    if (!(err instanceof RegistryBundleError)) throw err
    log.warn('Registry refused', { detail: err.detail })
    return { refusal: err.message }
  }
}

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
  return c.json({
    ...result,
    data: result.data.map((node) => ({
      id: node.id,
      nodeId: node.nodeId,
      version: node.version,
      installedBy: node.installedBy,
      installedAt: node.installedAt,
      updatedAt: node.updatedAt,
    })),
  })
})

marketplace.get('/', async (c) => {
  const remoteRegistry = c.get('remoteNodeRegistry')
  if (!remoteRegistry) return c.json({ error: 'Node registry not configured' }, 503)

  const organizationId = c.get('organizationId')
  const db = c.get('db')

  // The org's installs and how many workflows use each come from one statement.
  const [fetched, installed] = await Promise.all([
    fromRegistry(() => remoteRegistry.getIndex()),
    db.listNodeUsage(organizationId),
  ])
  // The page reads 503 as "can't reach the registry"; installed nodes keep working.
  if ('refusal' in fetched) return c.json({ error: fetched.refusal }, 503)
  const index = fetched.value
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

  const fetched = await fromRegistry(() => remoteRegistry.getIndex())
  if ('refusal' in fetched) return c.json({ error: fetched.refusal }, 503)
  const node = fetched.value.nodes.find((n) => n.id === c.req.param('nodeId'))
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

  // The registry, not this request, is at fault: a bad gateway, with its reason.
  const fetchedIndex = await fromRegistry(() => remoteRegistry.getIndex())
  if ('refusal' in fetchedIndex) return c.json({ error: fetchedIndex.refusal }, 502)
  const nodeEntry = fetchedIndex.value.nodes.find((n) => n.id === nodeId)
  if (!nodeEntry) return c.json({ error: 'Node not found in registry' }, 404)

  const targetVersion = version ?? nodeEntry.latest
  if (!nodeEntry.versions.some((v) => v.version === targetVersion)) {
    return c.json({ error: `Version ${targetVersion} not found` }, 404)
  }

  const fetched = await fromRegistry(() => remoteRegistry.getNodeBundle(nodeId, targetVersion))
  if ('refusal' in fetched) return c.json({ error: fetched.refusal }, 502)
  const bundle = fetched.value

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

  // The registry, not this request, is at fault: a bad gateway, with its reason.
  const fetchedIndex = await fromRegistry(() => remoteRegistry.getIndex())
  if ('refusal' in fetchedIndex) return c.json({ error: fetchedIndex.refusal }, 502)
  const nodeEntry = fetchedIndex.value.nodes.find((n) => n.id === nodeId)
  if (!nodeEntry) return c.json({ error: 'Node not found in registry' }, 404)

  const targetVersion = version ?? nodeEntry.latest
  if (!nodeEntry.versions.some((v) => v.version === targetVersion)) {
    return c.json({ error: `Version ${targetVersion} not found` }, 404)
  }

  if (existing.version === targetVersion) {
    return c.json({ error: 'Already on this version' }, 409)
  }

  const fetched = await fromRegistry(() => remoteRegistry.getNodeBundle(nodeId, targetVersion))
  if ('refusal' in fetched) return c.json({ error: fetched.refusal }, 502)
  const bundle = fetched.value

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
