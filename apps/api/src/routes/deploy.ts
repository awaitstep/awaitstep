import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { CloudflareWorkflowsAdapter } from '@awaitstep/provider-cloudflare'
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
  const ir = JSON.parse(version.ir)
  const artifact = adapter.generate(ir)

  const result = await adapter.deploy(artifact, {
    provider: 'cloudflare-workflows',
    credentials: {
      accountId: connection.accountId,
      apiToken: connection.apiToken,
    },
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
    },
  })

  return c.json(result, result.success ? 200 : 500)
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
  const config = {
    provider: 'cloudflare-workflows',
    credentials: {
      accountId: connection.accountId,
      apiToken: connection.apiToken,
    },
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
