import { Hono } from 'hono'
import { CloudflareAPI, sanitizedWorkflowName } from '@awaitstep/provider-cloudflare'
import type { AppEnv } from '../types.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { zValidator } from '../lib/validation.js'

export const runs = new Hono<AppEnv>()

runs.get('/:workflowId/runs', zValidator('query', paginationQuerySchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const { cursor, limit } = c.req.valid('query')
  const result = await db.listRunsByWorkflow(workflow.id, { cursor, limit })
  return c.json(result)
})

// Pure DB read — the background run-sync loop (lib/run-sync.ts) reconciles
// status and per-step telemetry from the provider; requests never block on
// provider round-trips.
runs.get('/:workflowId/runs/:runId', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getWorkflowRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  return c.json(run)
})

/**
 * Per-step telemetry for a run, synced by the background loop. Ownership is
 * enforced inside the query (steps JOIN runs filtered by workflowId), so an
 * unknown or foreign run reads as an empty list.
 */
runs.get('/:workflowId/runs/:runId/steps', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const steps = await db.listRunSteps(c.req.param('runId'), workflow.id)
  return c.json({ data: steps })
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
  if (!connection || connection.organizationId !== organizationId)
    return c.json({ error: 'Connection not found' }, 404)

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
  if (!connection || connection.organizationId !== organizationId)
    return c.json({ error: 'Connection not found' }, 404)

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
  if (!connection || connection.organizationId !== organizationId)
    return c.json({ error: 'Connection not found' }, 404)

  const terminateCreds = JSON.parse(connection.credentials) as {
    accountId: string
    apiToken: string
  }
  const cfApi = new CloudflareAPI(terminateCreds)
  await cfApi.terminateInstance(sanitizedWorkflowName(workflow.name), run.instanceId)
  await db.updateRun(run.id, { status: 'terminated' })
  return c.json({ ok: true })
})
