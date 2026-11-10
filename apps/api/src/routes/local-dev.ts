import { Hono } from 'hono'
import { NO_VERSION_MESSAGE } from '../lib/blank-source.js'
import { GenerateInputError, supportsLocalDev, type LocalDevProvider } from '@awaitstep/codegen'
import { splitEnvVars } from '@awaitstep/codegen'
import type { AppEnv } from '../types.js'
import { prepareWorkflow, isPrepareError } from '../lib/workflow-prepare.js'
import { resolveProvider } from '../lib/provider-resolver.js'
import {
  activeLocalDevSession,
  claimLocalDevSession,
  currentLocalDevSession,
  recordLocalDevRuntime,
  releaseLocalDevSession,
} from '../lib/local-dev-sessions.js'

export const localDev = new Hono<AppEnv>()

// ── Start ──────────────────────────────────────────────

localDev.post('/:workflowId/local-dev/start', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  if (!workflow.currentVersionId) return c.json({ error: NO_VERSION_MESSAGE }, 400)

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

  const body = await c.req.json().catch(() => ({}))
  const mode = body?.mode === 'ide' ? 'ide' : 'canvas'
  const claim = claimLocalDevSession({
    workflowId: workflow.id,
    organizationId: c.get('organizationId'),
    provider: prepared.adapter.name,
    mode,
  })
  if (!claim.ok) {
    return c.json(
      {
        error: 'Another local dev session is running. Stop it before starting this one.',
      },
      409,
    )
  }

  const { vars, secrets } = prepared.envVars
    ? splitEnvVars(prepared.envVars, {
        exclude: (name) => prepared.adapter.isInternalEnvVar?.(name) ?? false,
      })
    : { vars: {}, secrets: {} }

  try {
    const result = await (prepared.adapter as LocalDevProvider).startLocalDev(prepared.bundle, {
      workflowId: workflow.id,
      workflowName: workflow.name,
      kind: prepared.ir.kind === 'script' ? 'script' : 'workflow',
      ir: prepared.ir,
      dependencies: prepared.dependencies,
      ...(Object.keys(vars).length > 0 && { vars }),
      ...(Object.keys(secrets).length > 0 && { secrets }),
    })

    recordLocalDevRuntime(workflow.id, c.get('organizationId'), result)
    return c.json({
      status: 'running',
      port: result.port,
      url: result.url,
      pid: result.pid,
      mode,
      warnings: result.warnings ?? [],
    })
  } catch (err) {
    releaseLocalDevSession(workflow.id, c.get('organizationId'))
    const message = err instanceof Error ? err.message : 'Failed to start local dev'
    return c.json({ error: message }, err instanceof GenerateInputError ? 422 : 500)
  }
})

// ── Session ────────────────────────────────────────────

localDev.get('/:workflowId/local-dev', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const session = currentLocalDevSession(workflow.id, c.get('organizationId'))
  if (!session) return c.json({ error: 'No active session' }, 404)
  return c.json({
    status: 'running',
    mode: session.mode,
    port: session.port,
    url: session.url,
    pid: session.pid,
    startedAt: session.startedAt,
    warnings: session.warnings,
  })
})

// ── Stop ───────────────────────────────────────────────

localDev.post('/:workflowId/local-dev/stop', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const session = currentLocalDevSession(workflow.id, c.get('organizationId'))
  if (!session) return c.json({ error: 'No active session — start local dev first' }, 400)
  const adapter = resolveProvider(session.provider)
  if (!supportsLocalDev(adapter)) {
    return c.json({ error: 'Provider does not support local development' }, 501)
  }
  await adapter.stopLocalDev()
  releaseLocalDevSession(workflow.id, c.get('organizationId'))
  return c.json({ status: 'stopped' })
})

// ── Trigger ────────────────────────────────────────────

localDev.post('/:workflowId/local-dev/trigger', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const session = currentLocalDevSession(workflow.id, c.get('organizationId'))
  if (!session) return c.json({ error: 'No active session — start local dev first' }, 400)
  const adapter = resolveProvider(session.provider)
  if (!supportsLocalDev(adapter)) {
    return c.json({ error: 'Provider does not support local development' }, 501)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const result = await adapter.triggerLocalDev(body)
    return c.json(result.data, result.status as 200)
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

  const session = currentLocalDevSession(workflow.id, c.get('organizationId'))
  if (!session) return c.json({ error: 'No active session — start local dev first' }, 400)
  const adapter = resolveProvider(session.provider)
  if (!supportsLocalDev(adapter)) {
    return c.json({ error: 'Provider does not support local development' }, 501)
  }

  const instanceId = c.req.param('instanceId')
  try {
    const result = await adapter.localDevInstance(instanceId)
    return c.json(result.data, result.status as 200)
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to get instance status' },
      502,
    )
  }
})

// ── Logs ───────────────────────────────────────────────

localDev.get('/:workflowId/local-dev/logs', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const session = currentLocalDevSession(workflow.id, c.get('organizationId'))
  if (!session) return c.json({ error: 'No active session — start local dev first' }, 400)
  const adapter = resolveProvider(session.provider)
  if (!supportsLocalDev(adapter)) {
    return c.json({ error: 'Provider does not support local development' }, 501)
  }
  const since = Number(c.req.query('since') ?? '0')
  const logs = await adapter.readLocalDevLogs(since || undefined)
  return c.json(logs)
})

// ── Cleanup (process shutdown) ─────────────────────────

export async function cleanupLocalDevSessions(): Promise<void> {
  const session = activeLocalDevSession()
  if (!session) return
  const adapter = resolveProvider(session.provider)
  if (supportsLocalDev(adapter)) await adapter.stopLocalDev()
  releaseLocalDevSession(session.workflowId, session.organizationId)
}
