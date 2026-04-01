import { Hono } from 'hono'
import { supportsLocalDev, type LocalDevProvider } from '@awaitstep/codegen'
import { killPort, isPortListening, readLogs, LOCAL_DEV_PORT } from '@awaitstep/provider-cloudflare'
import type { AppEnv } from '../types.js'
import { prepareWorkflow, isPrepareError } from '../lib/workflow-prepare.js'

const LOCAL_DEV_URL = `http://localhost:${LOCAL_DEV_PORT}`

export const localDev = new Hono<AppEnv>()

// ── Start ──────────────────────────────────────────────

localDev.post('/:workflowId/local-dev/start', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  if (!workflow.currentVersionId) return c.json({ error: 'No version to test' }, 400)

  const prepared = await prepareWorkflow({
    db: c.get('db'),
    workflow,
    organizationId: c.get('organizationId'),
    projectId: c.get('projectId'),
    nodeRegistry: c.get('nodeRegistry'),
  })

  if (isPrepareError(prepared)) {
    return c.json({ error: prepared.error, details: prepared.details }, prepared.status as 400)
  }

  if (!supportsLocalDev(prepared.adapter)) {
    return c.json({ error: 'Provider does not support local development' }, 501)
  }

  const vars: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  if (prepared.envVars) {
    for (const [name, entry] of Object.entries(prepared.envVars)) {
      if (entry.isSecret) {
        secrets[name] = entry.value
      } else {
        vars[name] = entry.value
      }
    }
  }

  try {
    const result = await (prepared.adapter as LocalDevProvider).startLocalDev(prepared.artifact, {
      workflowId: workflow.id,
      workflowName: workflow.name,
      dependencies: prepared.dependencies,
      ...(Object.keys(vars).length > 0 && { vars }),
      ...(Object.keys(secrets).length > 0 && { secrets }),
    })

    return c.json({ status: 'running', port: result.port, url: result.url, pid: result.pid })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to start local dev' }, 500)
  }
})

// ── Stop ───────────────────────────────────────────────

localDev.post('/:workflowId/local-dev/stop', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  await killPort(LOCAL_DEV_PORT)
  return c.json({ status: 'stopped' })
})

// ── Trigger ────────────────────────────────────────────

localDev.post('/:workflowId/local-dev/trigger', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  if (!(await isPortListening(LOCAL_DEV_PORT))) {
    return c.json({ error: 'No active session — start local dev first' }, 400)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const response = await fetch(LOCAL_DEV_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    return c.json(data ?? { status: response.status }, response.status as 200)
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to trigger local workflow' },
      502,
    )
  }
})

// ── Instance status ────────────────────────────────────

localDev.get('/:workflowId/local-dev/instance/:instanceId', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  if (!(await isPortListening(LOCAL_DEV_PORT))) {
    return c.json({ error: 'No active session' }, 400)
  }

  const instanceId = c.req.param('instanceId')
  try {
    const response = await fetch(`${LOCAL_DEV_URL}?instanceId=${encodeURIComponent(instanceId)}`)
    const data = await response.json().catch(() => null)
    return c.json(data ?? { status: response.status }, response.status as 200)
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to get instance status' },
      502,
    )
  }
})

// ── Status ─────────────────────────────────────────────

localDev.get('/:workflowId/local-dev/status', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const active = await isPortListening(LOCAL_DEV_PORT)
  if (!active) return c.json({ active: false })

  return c.json({ active: true, port: LOCAL_DEV_PORT, url: LOCAL_DEV_URL })
})

// ── Logs ───────────────────────────────────────────────

localDev.get('/:workflowId/local-dev/logs', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const since = Number(c.req.query('since') ?? '0')
  const logs = await readLogs(since || undefined)
  return c.json(logs)
})

// ── Cleanup (process shutdown) ─────────────────────────

export async function cleanupLocalDevSessions(): Promise<void> {
  await killPort(LOCAL_DEV_PORT)
}
