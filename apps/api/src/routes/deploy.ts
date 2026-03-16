import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { CloudflareWorkflowsAdapter, workerName } from '@awaitstep/provider-cloudflare'
import type { AppEnv } from '../types.js'

const deploySchema = z.object({
  connectionId: z.string().min(1),
  versionId: z.string().min(1).optional(),
})

const triggerSchema = z.object({
  connectionId: z.string().min(1),
  params: z.unknown().optional(),
})

export const deploy = new Hono<AppEnv>()

deploy.post('/:workflowId/deploy', zValidator('json', deploySchema), async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  const connection = await db.getConnectionById(body.connectionId)
  if (!connection || connection.userId !== userId) return c.json({ error: 'Connection not found' }, 404)

  const versionId = body.versionId ?? workflow.currentVersionId
  if (!versionId) return c.json({ error: 'No version to deploy' }, 400)

  const version = await db.getVersionById(versionId)
  if (!version || version.workflowId !== workflow.id) return c.json({ error: 'Version not found' }, 404)

  const adapter = new CloudflareWorkflowsAdapter()
  const creds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const providerConfig = {
    provider: 'cloudflare-workflows',
    credentials: creds,
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
    },
  }

  const ir = JSON.parse(version.ir)
  const validation = adapter.validate(ir)
  if (!validation.ok) {
    return c.json({ error: 'IR validation failed', details: validation.errors }, 400)
  }

  const credCheck = await adapter.verifyCredentials(providerConfig)
  if (!credCheck.valid) {
    return c.json({ error: credCheck.error }, 403)
  }

  const artifact = adapter.generate(ir)
  const result = await adapter.deploy(artifact, providerConfig)

  return c.json(result, result.success ? 200 : 500)
})

deploy.post('/:workflowId/deploy-stream', zValidator('json', deploySchema), async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  const connection = await db.getConnectionById(body.connectionId)
  if (!connection || connection.userId !== userId) return c.json({ error: 'Connection not found' }, 404)

  const versionId = body.versionId ?? workflow.currentVersionId
  if (!versionId) return c.json({ error: 'No version to deploy' }, 400)

  const version = await db.getVersionById(versionId)
  if (!version || version.workflowId !== workflow.id) return c.json({ error: 'Version not found' }, 404)

  const adapter = new CloudflareWorkflowsAdapter()
  const streamCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const providerConfig = {
    provider: 'cloudflare-workflows',
    credentials: streamCreds,
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
    },
  }

  const ir = JSON.parse(version.ir)
  const validation = adapter.validate(ir)
  if (!validation.ok) {
    return c.json({ error: 'IR validation failed', details: validation.errors }, 400)
  }

  const credCheck = await adapter.verifyCredentials(providerConfig)
  if (!credCheck.valid) {
    return c.json({ error: credCheck.error }, 403)
  }

  return streamSSE(c, async (stream) => {
    const artifact = adapter.generate(ir)

    let eventId = 0
    const result = await adapter.deployWithProgress(
      artifact,
      providerConfig,
      async (progress) => {
        await stream.writeSSE({
          id: String(eventId++),
          event: 'progress',
          data: JSON.stringify(progress),
        })
      },
    )

    await db.createDeployment({
      id: nanoid(),
      workflowId: workflow.id,
      versionId,
      connectionId: body.connectionId,
      serviceName: result.deploymentId || '',
      serviceUrl: result.url,
      status: result.success ? 'success' : 'failed',
      error: result.error,
    })

    await stream.writeSSE({
      id: String(eventId++),
      event: 'result',
      data: JSON.stringify(result),
    })
  })
})

deploy.get('/:workflowId/deployments', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const list = await db.listDeploymentsByWorkflow(workflow.id)
  return c.json(list)
})

deploy.post('/:workflowId/trigger', zValidator('json', triggerSchema), async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  if (!workflow.currentVersionId) return c.json({ error: 'No version deployed' }, 400)

  const connection = await db.getConnectionById(body.connectionId)
  if (!connection || connection.userId !== userId) return c.json({ error: 'Connection not found' }, 404)

  const adapter = new CloudflareWorkflowsAdapter()
  const triggerCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const config = {
    provider: 'cloudflare-workflows',
    credentials: triggerCreds,
    options: {
      workflowName: workflow.name,
    },
  }

  const { instanceId } = await adapter.trigger(workflow.id, body.params, config)

  const run = await db.createRun({
    id: nanoid(),
    workflowId: workflow.id,
    versionId: workflow.currentVersionId,
    connectionId: body.connectionId,
    instanceId,
    status: 'queued',
  })

  return c.json(run, 201)
})

deploy.post('/:workflowId/takedown', zValidator('json', z.object({ connectionId: z.string().min(1) })), async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const { connectionId } = c.req.valid('json')

  const connection = await db.getConnectionById(connectionId)
  if (!connection || connection.userId !== userId) return c.json({ error: 'Connection not found' }, 404)

  const name = workerName(workflow.id)
  const creds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const adapter = new CloudflareWorkflowsAdapter()
  const result = await adapter.destroy(name, {
    provider: 'cloudflare-workflows',
    credentials: creds,
  })

  if (result.success) {
    await db.deleteDeploymentsByWorkflow(workflow.id)
    await db.updateWorkflow(workflow.id, { currentVersionId: null })
  }

  return c.json(result, result.success ? 200 : 500)
})
