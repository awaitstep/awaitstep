import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { workerName } from '@awaitstep/provider-cloudflare'
import type { ProviderConfig, GeneratedArtifact, DeployResult } from '@awaitstep/codegen'
import type { AppEnv } from '../types.js'
import { resolveProvider } from '../lib/provider-resolver.js'
import { prepareDeploy, isDeployError } from '../lib/deploy-prepare.js'

const deploySchema = z.object({
  connectionId: z.string().min(1),
  versionId: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const MAX_TRIGGER_PARAMS_BYTES = 102_400 // 100 KB

const triggerSchema = z.object({
  connectionId: z.string().min(1),
  params: z
    .unknown()
    .optional()
    .refine((val) => val === undefined || JSON.stringify(val).length <= MAX_TRIGGER_PARAMS_BYTES, {
      message: `Trigger params must be under ${MAX_TRIGGER_PARAMS_BYTES / 1024} KB`,
    }),
})

export const deploy = new Hono<AppEnv>()

deploy.post('/:workflowId/deploy', zValidator('json', deploySchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  const prepared = await prepareDeploy({
    db,
    workflow,
    organizationId: c.get('organizationId'),
    projectId: c.get('projectId'),
    connectionId: body.connectionId,
    versionId: body.versionId,
    nodeRegistry: c.get('nodeRegistry'),
    appName: c.get('appName'),
    deploymentConfig: body.config,
  })

  if (isDeployError(prepared)) {
    return c.json({ error: prepared.error, details: prepared.details }, prepared.status as 400)
  }

  const { adapter, artifact, providerConfig, versionId, connectionId } = prepared
  const configSnapshot = JSON.stringify(prepared.resolvedDeploymentConfig)
  const result = await adapter.deploy(artifact, providerConfig)

  await db.createDeployment({
    id: nanoid(),
    workflowId: workflow.id,
    versionId,
    connectionId,
    serviceName: result.deploymentId || '',
    serviceUrl: result.url,
    status: result.success ? 'success' : 'failed',
    error: result.error,
    configSnapshot,
  })

  // Post-deploy: persist config only on success
  if (result.success) {
    await db.upsertDeploymentConfig({
      id: nanoid(),
      workflowId: workflow.id,
      connectionId,
      provider: prepared.connectionProvider,
      config: configSnapshot,
      updatedBy: c.get('userId'),
    })
  }

  return c.json(result, result.success ? 200 : 500)
})

deploy.post('/:workflowId/deploy-stream', zValidator('json', deploySchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  const prepared = await prepareDeploy({
    db,
    workflow,
    organizationId: c.get('organizationId'),
    projectId: c.get('projectId'),
    connectionId: body.connectionId,
    versionId: body.versionId,
    nodeRegistry: c.get('nodeRegistry'),
    appName: c.get('appName'),
    deploymentConfig: body.config,
  })

  if (isDeployError(prepared)) {
    return c.json({ error: prepared.error, details: prepared.details }, prepared.status as 400)
  }

  const { adapter, artifact, providerConfig, versionId, connectionId } = prepared
  const configSnapshot = JSON.stringify(prepared.resolvedDeploymentConfig)

  return streamSSE(c, async (stream) => {
    let eventId = 0
    const onProgress = async (progress: unknown) => {
      await stream.writeSSE({
        id: String(eventId++),
        event: 'progress',
        data: JSON.stringify(progress),
      })
    }

    const adapterRecord = adapter as unknown as Record<string, unknown>
    const hasProgressDeploy =
      'deployWithProgress' in adapter && typeof adapterRecord.deployWithProgress === 'function'

    const result = hasProgressDeploy
      ? await (
          adapterRecord.deployWithProgress as (
            a: GeneratedArtifact,
            c: ProviderConfig,
            p: (progress: unknown) => Promise<void>,
          ) => Promise<DeployResult>
        )(artifact, providerConfig, onProgress)
      : await adapter.deploy(artifact, providerConfig)

    await db.createDeployment({
      id: nanoid(),
      workflowId: workflow.id,
      versionId,
      connectionId,
      serviceName: result.deploymentId || '',
      serviceUrl: result.url,
      status: result.success ? 'success' : 'failed',
      error: result.error,
      configSnapshot,
    })

    // Post-deploy: persist config only on success
    if (result.success) {
      await db.upsertDeploymentConfig({
        id: nanoid(),
        workflowId: workflow.id,
        connectionId,
        provider: prepared.connectionProvider,
        config: configSnapshot,
        updatedBy: c.get('userId'),
      })
    }

    await stream.writeSSE({
      id: String(eventId++),
      event: 'result',
      data: JSON.stringify(result),
    })
  })
})

deploy.get('/:workflowId/deploy-config/:connectionId', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const connectionId = c.req.param('connectionId')
  const organizationId = c.get('organizationId')

  const connection = await db.getProviderConnectionById(connectionId, organizationId)
  if (!connection) {
    return c.json({ error: 'Connection not found' }, 404)
  }

  const adapter = resolveProvider(connection.provider)
  const stored = await db.getDeploymentConfig(workflow.id, connectionId)
  const config = stored ? JSON.parse(stored.config) : adapter.getDefaultDeploymentConfig()
  const preview = adapter.buildDeploymentConfigPreview(config)
  const uiSchema = adapter.deploymentConfigUiSchema

  return c.json({ config, provider: connection.provider, preview, uiSchema })
})

deploy.post(
  '/:workflowId/deploy-config-preview',
  zValidator(
    'json',
    z.object({
      connectionId: z.string().min(1),
      config: z.record(z.string(), z.unknown()),
    }),
  ),
  async (c) => {
    const organizationId = c.get('organizationId')
    const body = c.req.valid('json')
    const db = c.get('db')

    const connection = await db.getProviderConnectionById(body.connectionId, organizationId)
    if (!connection) {
      return c.json({ error: 'Connection not found' }, 404)
    }

    const adapter = resolveProvider(connection.provider)
    const preview = adapter.buildDeploymentConfigPreview(body.config)
    return c.json(preview)
  },
)

deploy.get('/:workflowId/deployments', zValidator('query', paginationQuerySchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const { cursor, limit } = c.req.valid('query')
  const result = await db.listDeploymentsByWorkflow(workflow.id, { cursor, limit })
  return c.json(result)
})

deploy.post('/:workflowId/trigger', zValidator('json', triggerSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  if (!workflow.currentVersionId) return c.json({ error: 'No version deployed' }, 400)

  const connection = await db.getProviderConnectionById(body.connectionId, organizationId)
  if (!connection) return c.json({ error: 'Connection not found' }, 404)

  const adapter = resolveProvider(undefined, {
    templateResolver: c.get('nodeRegistry')?.templateResolver,
  })
  const triggerCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const config = {
    provider: 'cloudflare',
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

deploy.post(
  '/:workflowId/takedown',
  zValidator('json', z.object({ connectionId: z.string().min(1) })),
  async (c) => {
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const workflow = c.get('workflow')
    if (!workflow) return c.json({ error: 'Not found' }, 404)

    const { connectionId } = c.req.valid('json')

    const connection = await db.getProviderConnectionById(connectionId, organizationId)
    if (!connection) return c.json({ error: 'Connection not found' }, 404)

    const name = workerName(workflow.id)
    const creds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
    const adapter = resolveProvider(undefined, {
      templateResolver: c.get('nodeRegistry')?.templateResolver,
    })
    const result = await adapter.destroy(name, {
      provider: 'cloudflare',
      credentials: creds,
    })

    if (result.success) {
      await db.deleteDeploymentsByWorkflow(workflow.id)
      await db.updateWorkflow(workflow.id, { currentVersionId: null })
    }

    return c.json(result, result.success ? 200 : 500)
  },
)
