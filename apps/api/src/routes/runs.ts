import { Hono } from 'hono'
import { CloudflareAPI, mapCFStatus, sanitizedWorkflowName } from '@awaitstep/provider-cloudflare'
import type { AppEnv } from '../types.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('runs')

export const runs = new Hono<AppEnv>()

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])

runs.get('/:workflowId/runs', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const runsList = await db.listRunsByWorkflow(workflow.id)
  return c.json(runsList)
})

runs.get('/:workflowId/runs/:runId', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const runId = c.req.param('runId')
  const run = await db.getWorkflowRunById(runId)
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)

  // Fetch live status from CF if run is non-terminal
  if (run.connectionId && run.instanceId && !TERMINAL_STATUSES.has(run.status)) {
    try {
      const connection = await db.getProviderConnectionById(run.connectionId)
      if (connection && connection.organizationId === organizationId) {
        const creds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
        const cfApi = new CloudflareAPI(creds)
        const status = await cfApi.getInstanceStatus(sanitizedWorkflowName(workflow.name), run.instanceId)
        const mapped = mapCFStatus(status.status)

        const updates: { status?: string; output?: string; error?: string; updatedAt?: string } = {}
        if (mapped !== run.status) updates.status = mapped
        if (status.output) updates.output = JSON.stringify(status.output)
        if (status.error) updates.error = JSON.stringify(status.error)
        // Use provider timestamp for accurate duration
        if (status.modified_on) updates.updatedAt = status.modified_on

        if (Object.keys(updates).length > 0) {
          const updated = await db.updateRun(run.id, updates)
          return c.json(updated)
        }
      }
    } catch (err) {
      log.error('Failed to sync run status from Cloudflare', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return c.json(run)
})

runs.post('/:workflowId/runs/:runId/pause', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getWorkflowRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  if (!run.connectionId || !run.instanceId) return c.json({ error: 'No connection' }, 400)

  const connection = await db.getProviderConnectionById(run.connectionId)
  if (!connection || connection.organizationId !== organizationId) return c.json({ error: 'Connection not found' }, 404)

  const pauseCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const cfApi = new CloudflareAPI(pauseCreds)
  await cfApi.pauseInstance(sanitizedWorkflowName(workflow.name), run.instanceId)
  await db.updateRun(run.id, { status: 'paused' })
  return c.json({ ok: true })
})

runs.post('/:workflowId/runs/:runId/resume', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getWorkflowRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  if (!run.connectionId || !run.instanceId) return c.json({ error: 'No connection' }, 400)

  const connection = await db.getProviderConnectionById(run.connectionId)
  if (!connection || connection.organizationId !== organizationId) return c.json({ error: 'Connection not found' }, 404)

  const resumeCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const cfApi = new CloudflareAPI(resumeCreds)
  await cfApi.resumeInstance(sanitizedWorkflowName(workflow.name), run.instanceId)
  await db.updateRun(run.id, { status: 'running' })
  return c.json({ ok: true })
})

runs.post('/:workflowId/runs/:runId/terminate', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getWorkflowRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  if (!run.connectionId || !run.instanceId) return c.json({ error: 'No connection' }, 400)

  const connection = await db.getProviderConnectionById(run.connectionId)
  if (!connection || connection.organizationId !== organizationId) return c.json({ error: 'Connection not found' }, 404)

  const terminateCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const cfApi = new CloudflareAPI(terminateCreds)
  await cfApi.terminateInstance(sanitizedWorkflowName(workflow.name), run.instanceId)
  await db.updateRun(run.id, { status: 'terminated' })
  return c.json({ ok: true })
})
