import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '../lib/validation.js'
import { supportsLocalDev, type LocalDevSession } from '@awaitstep/codegen'
import type { WorkflowIR } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'
import { resolveProvider, validateNodesForProvider } from '../lib/provider-resolver.js'
import {
  parseDependencies,
  collectNodeDependencies,
  mergeDependencies,
} from '../lib/dependencies.js'

const sessions = new Map<string, LocalDevSession>()

function isLocalhostUrl(url: string): boolean {
  return url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:')
}

/** Clean up all active sessions — call from process shutdown hook. */
export async function cleanupLocalDevSessions(): Promise<void> {
  const stops = Array.from(sessions.values()).map((s) => s.stop())
  await Promise.allSettled(stops)
  sessions.clear()
}

const startSchema = z.object({
  port: z.number().int().min(1024).max(65535).optional(),
  provider: z.string().optional(),
})

export const localDev = new Hono<AppEnv>()

localDev.post('/:workflowId/local-dev/start', zValidator('json', startSchema), async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  if (!workflow.currentVersionId) return c.json({ error: 'No version to test' }, 400)

  const nodeRegistry = c.get('nodeRegistry')
  const body = c.req.valid('json')
  const adapter = resolveProvider(body.provider, {
    templateResolver: nodeRegistry?.templateResolver,
  })

  if (!supportsLocalDev(adapter)) {
    return c.json({ error: 'Provider does not support local development' }, 501)
  }

  // Stop existing session for this workflow
  const existing = sessions.get(workflow.id)
  if (existing) {
    await existing.stop()
    sessions.delete(workflow.id)
  }

  // Check for port collision with other workflows' sessions
  const requestedPort = body.port ?? 8787
  for (const [wfId, s] of sessions) {
    if (wfId !== workflow.id && s.port === requestedPort) {
      return c.json(
        { error: `Port ${requestedPort} is already in use by another workflow session` },
        409,
      )
    }
  }

  const db = c.get('db')
  const version = await db.getWorkflowVersionById(workflow.currentVersionId)
  if (!version) return c.json({ error: 'Version not found' }, 404)

  const ir = JSON.parse(version.ir) as WorkflowIR
  const validation = adapter.validate(ir)
  if (!validation.ok) {
    return c.json({ error: 'IR validation failed', details: validation.errors }, 400)
  }

  const nodeCheck = validateNodesForProvider(ir, body.provider)
  if (!nodeCheck.valid) {
    return c.json(
      { error: `Nodes not supported by this provider: ${nodeCheck.unsupportedNodes.join(', ')}` },
      400,
    )
  }

  const artifact = adapter.generate(ir)

  const workflowDeps = parseDependencies(workflow.dependencies)
  const nodeDeps = collectNodeDependencies(ir, nodeRegistry)
  const deps = mergeDependencies(workflowDeps, nodeDeps)

  try {
    const session = await adapter.startLocalDev(artifact, {
      workflowId: workflow.id,
      workflowName: workflow.name,
      port: body.port,
      dependencies: deps,
    })

    sessions.set(workflow.id, session)

    return c.json({
      status: 'running',
      port: session.port,
      url: session.url,
      pid: session.pid,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to start local dev'
    return c.json({ error: msg }, 500)
  }
})

localDev.post('/:workflowId/local-dev/stop', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const session = sessions.get(workflow.id)
  if (!session) return c.json({ error: 'No active session' }, 404)

  await session.stop()
  sessions.delete(workflow.id)
  return c.json({ status: 'stopped' })
})

localDev.post('/:workflowId/local-dev/trigger', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const session = sessions.get(workflow.id)
  if (!session) return c.json({ error: 'No active session — start local dev first' }, 400)
  if (!isLocalhostUrl(session.url)) return c.json({ error: 'Invalid session URL' }, 500)

  try {
    const body = await c.req.json().catch(() => ({}))
    const response = await fetch(session.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    return c.json(data ?? { status: response.status }, response.status as 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to trigger local workflow'
    return c.json({ error: msg }, 502)
  }
})

localDev.get('/:workflowId/local-dev/instance/:instanceId', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const session = sessions.get(workflow.id)
  if (!session) return c.json({ error: 'No active session' }, 400)
  if (!isLocalhostUrl(session.url)) return c.json({ error: 'Invalid session URL' }, 500)

  const instanceId = c.req.param('instanceId')
  try {
    const response = await fetch(`${session.url}?instanceId=${encodeURIComponent(instanceId)}`)
    const data = await response.json().catch(() => null)
    return c.json(data ?? { status: response.status }, response.status as 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to get instance status'
    return c.json({ error: msg }, 502)
  }
})

localDev.get('/:workflowId/local-dev/status', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const session = sessions.get(workflow.id)
  if (!session) return c.json({ active: false })

  return c.json({
    active: true,
    port: session.port,
    url: session.url,
    pid: session.pid,
  })
})

localDev.get('/:workflowId/local-dev/logs', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const session = sessions.get(workflow.id)
  if (!session) return c.json({ error: 'No active session' }, 404)

  const since = Number(c.req.query('since') ?? '0')
  const logs = session.getLogs(since || undefined)
  return c.json(logs)
})
