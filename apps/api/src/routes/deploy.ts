import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { workerName } from '@awaitstep/provider-cloudflare'
import type { ProviderConfig, GeneratedBundle, DeployResult } from '@awaitstep/codegen'
import type { Workflow } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import { resolveProvider } from '../lib/provider-resolver.js'
import { prepareDeploy, isDeployError } from '../lib/deploy-prepare.js'
import { auditActor, recordAudit } from '../lib/audit.js'
import { sharedDeployGroupKey } from '@awaitstep/ir'
import { notify } from '../lib/notify.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('deploy')

/** What a deploy that crashed inside the provider says: no internals, an id to look it up by. */
export function unexpectedDeployFailure(requestId: string | undefined): string {
  return requestId
    ? `The deploy failed unexpectedly. Error ID ${requestId}.`
    : 'The deploy failed unexpectedly.'
}

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

/**
 * A workflow shared to its project runs in every workspace of it: a new
 * deploy reaches the admins of the others. Filed at the project — they can't
 * open the workspace it lives in.
 */
async function tellSharedDeploy(
  c: Context<AppEnv>,
  workflow: Workflow,
  version: number,
): Promise<void> {
  if (!workflow.sharedAt || !workflow.workspaceId) return
  await notify(c, {
    event: 'workflow.deploy.shared',
    organizationId: c.get('organizationId'),
    projectId: workflow.projectId,
    // One row a workflow an hour: a loop of deploys counts up instead of burying the Inbox.
    groupKey: sharedDeployGroupKey(workflow.id, new Date()),
    onRepeat: 'fold',
    meta: { person: auditActor(c).actor.actorName, workflow: workflow.name, version },
    recipients: {
      otherWorkspaceAdmins: { projectId: workflow.projectId, workspaceId: workflow.workspaceId },
    },
  })
}

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
    deployer: c.get('deployer'),
  })

  if (isDeployError(prepared)) {
    return c.json({ error: prepared.error, details: prepared.details }, prepared.status as 400)
  }

  const { adapter, bundle, providerConfig, versionId, connectionId } = prepared
  const configSnapshot = JSON.stringify(prepared.resolvedDeploymentConfig)
  // The deployment row's snapshot additionally pins the step manifest of the
  // code actually shipped — run telemetry joins step labels to nodes through
  // it. The reusable deployment_configs copy stays schema-clean.
  const deploymentSnapshot = bundle.manifest
    ? JSON.stringify({
        ...(prepared.resolvedDeploymentConfig as Record<string, unknown>),
        stepManifest: bundle.manifest,
      })
    : configSnapshot
  const result = await adapter.deploy(bundle, providerConfig)

  await db.createDeployment({
    id: nanoid(),
    workflowId: workflow.id,
    versionId,
    connectionId,
    serviceName: result.deploymentId || '',
    serviceUrl: result.url,
    status: result.success ? 'success' : 'failed',
    error: result.error,
    configSnapshot: deploymentSnapshot,
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
    await recordAudit(c, {
      event: 'workflow.deploy',
      facts: {
        name: workflow.name,
        version: prepared.versionNumber,
        provider: prepared.connectionName,
      },
      projectId: workflow.projectId,
      workspaceId: workflow.workspaceId,
    })
    await tellSharedDeploy(c, workflow, prepared.versionNumber)
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
    deployer: c.get('deployer'),
  })

  if (isDeployError(prepared)) {
    return c.json({ error: prepared.error, details: prepared.details }, prepared.status as 400)
  }

  const { adapter, bundle, providerConfig, versionId, connectionId } = prepared
  const configSnapshot = JSON.stringify(prepared.resolvedDeploymentConfig)
  // The deployment row's snapshot additionally pins the step manifest of the
  // code actually shipped — run telemetry joins step labels to nodes through
  // it. The reusable deployment_configs copy stays schema-clean.
  const deploymentSnapshot = bundle.manifest
    ? JSON.stringify({
        ...(prepared.resolvedDeploymentConfig as Record<string, unknown>),
        stepManifest: bundle.manifest,
      })
    : configSnapshot

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

    let result: DeployResult
    try {
      result = hasProgressDeploy
        ? await (
            adapterRecord.deployWithProgress as (
              a: GeneratedBundle,
              c: ProviderConfig,
              p: (progress: unknown) => Promise<void>,
            ) => Promise<DeployResult>
          )(bundle, providerConfig, onProgress)
        : await adapter.deploy(bundle, providerConfig)
    } catch (err) {
      // Adapter contract is to return DeployResult; an uncaught exception is
      // a provider bug. Without this catch the SSE stream would close silently
      // and the client would see no failure event. Its text (bundler output,
      // paths, upstream errors) goes to the log; the stream and the deployment
      // row get a generic reason with the request id to find it.
      const requestId = c.get('requestId')
      // The error itself as the data, so the log keeps its stack (the logger
      // serialises a top-level Error only); the ids go in the message.
      log.error(`Provider deploy threw (request ${requestId ?? '-'}, workflow ${workflow.id})`, err)
      result = { success: false, deploymentId: '', error: unexpectedDeployFailure(requestId) }
    }

    await db.createDeployment({
      id: nanoid(),
      workflowId: workflow.id,
      versionId,
      connectionId,
      serviceName: result.deploymentId || '',
      serviceUrl: result.url,
      status: result.success ? 'success' : 'failed',
      error: result.error,
      configSnapshot: deploymentSnapshot,
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
      await recordAudit(c, {
        event: 'workflow.deploy',
        facts: {
          name: workflow.name,
          version: prepared.versionNumber,
          provider: prepared.connectionName,
        },
        projectId: workflow.projectId,
        workspaceId: workflow.workspaceId,
      })
      await tellSharedDeploy(c, workflow, prepared.versionNumber)
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

  if (workflow.kind === 'script') {
    return c.json(
      {
        error:
          'Scripts have no instance lifecycle — invoke the deployed worker URL directly via HTTP POST',
      },
      400,
    )
  }

  if (!workflow.currentVersionId) return c.json({ error: 'No version deployed' }, 400)

  // Only a connection this workflow was deployed with: the Cloudflare workflow is
  // found by name, so any other account could hold another project's of that name.
  const [connection, storedDeployConfig] = await Promise.all([
    db.getConnectionDeployedWith(body.connectionId, organizationId, workflow.id),
    db.getDeploymentConfig(workflow.id, body.connectionId),
  ])
  if (!connection) {
    return c.json({ error: 'This workflow isn’t deployed with that connection' }, 404)
  }

  const adapter = resolveProvider(undefined, {
    templateResolver: c.get('nodeRegistry')?.templateResolver,
  })
  // Stored deployment config carries instance retention for created runs.
  // Invalid/stale/corrupt rows fall back to provider defaults (7-day
  // retention) — a bad row must never block triggering.
  let deploymentConfig: unknown
  if (storedDeployConfig) {
    try {
      const parsed = adapter.deploymentConfigSchema.safeParse(JSON.parse(storedDeployConfig.config))
      if (parsed.success) deploymentConfig = parsed.data
    } catch {
      /* corrupt JSON — use defaults */
    }
  }
  const triggerCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const config = {
    provider: 'cloudflare',
    credentials: triggerCreds,
    options: {
      workflowName: workflow.name,
      ...(deploymentConfig !== undefined && { deploymentConfig }),
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
      await recordAudit(c, {
        event: 'workflow.takedown',
        facts: { name: workflow.name },
        projectId: workflow.projectId,
        workspaceId: workflow.workspaceId,
      })
    }

    return c.json(result, result.success ? 200 : 500)
  },
)
