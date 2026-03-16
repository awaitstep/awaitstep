import { Hono } from 'hono'
import { CloudflareAPI } from '@awaitstep/provider-cloudflare'
import type { AppEnv } from '../types.js'

export const runs = new Hono<AppEnv>()

runs.get('/:workflowId/runs', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const runsList = await db.listRunsByWorkflow(workflow.id)
  return c.json(runsList)
})

runs.get('/:workflowId/runs/:runId', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const runId = c.req.param('runId')
  const run = await db.getRunById(runId)
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)

  // Fetch live status from CF if we have a connection
  if (run.connectionId && run.instanceId) {
    try {
      const connection = await db.getConnectionById(run.connectionId)
      if (connection && connection.userId === userId) {
        const cfApi = new CloudflareAPI({
          accountId: connection.accountId,
          apiToken: connection.apiToken,
        })
        const status = await cfApi.getInstanceStatus(workflow.name, run.instanceId)

        // Update DB with latest status
        if (status.status !== run.status) {
          await db.updateRun(run.id, {
            status: status.status,
            output: status.output ? JSON.stringify(status.output) : undefined,
            error: status.error ? JSON.stringify(status.error) : undefined,
          })
          return c.json({ ...run, status: status.status, output: status.output, error: status.error })
        }
      }
    } catch {
      // Fall through to return cached DB data
    }
  }

  return c.json(run)
})

runs.post('/:workflowId/runs/:runId/pause', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  if (!run.connectionId || !run.instanceId) return c.json({ error: 'No connection' }, 400)

  const connection = await db.getConnectionById(run.connectionId)
  if (!connection || connection.userId !== userId) return c.json({ error: 'Connection not found' }, 404)

  const cfApi = new CloudflareAPI({ accountId: connection.accountId, apiToken: connection.apiToken })
  await cfApi.pauseInstance(workflow.name, run.instanceId)
  await db.updateRun(run.id, { status: 'paused' })
  return c.json({ ok: true })
})

runs.post('/:workflowId/runs/:runId/resume', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  if (!run.connectionId || !run.instanceId) return c.json({ error: 'No connection' }, 400)

  const connection = await db.getConnectionById(run.connectionId)
  if (!connection || connection.userId !== userId) return c.json({ error: 'Connection not found' }, 404)

  const cfApi = new CloudflareAPI({ accountId: connection.accountId, apiToken: connection.apiToken })
  await cfApi.resumeInstance(workflow.name, run.instanceId)
  await db.updateRun(run.id, { status: 'running' })
  return c.json({ ok: true })
})

runs.post('/:workflowId/runs/:runId/terminate', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  if (!run.connectionId || !run.instanceId) return c.json({ error: 'No connection' }, 400)

  const connection = await db.getConnectionById(run.connectionId)
  if (!connection || connection.userId !== userId) return c.json({ error: 'Connection not found' }, 404)

  const cfApi = new CloudflareAPI({ accountId: connection.accountId, apiToken: connection.apiToken })
  await cfApi.terminateInstance(workflow.name, run.instanceId)
  await db.updateRun(run.id, { status: 'terminated' })
  return c.json({ ok: true })
})
