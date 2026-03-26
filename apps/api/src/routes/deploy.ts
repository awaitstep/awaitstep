import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { workerName } from '@awaitstep/provider-cloudflare'
import type { ProviderConfig, GeneratedArtifact, DeployResult } from '@awaitstep/codegen'
import type { AppEnv } from '../types.js'
import type { AppNodeRegistry } from '../lib/node-registry.js'

function parseDependencies(raw: string | null | undefined): Record<string, string> | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    if (Object.keys(parsed).length === 0) return undefined
    return parsed as Record<string, string>
  } catch {
    return undefined
  }
}

function collectNodeDependencies(
  ir: WorkflowIR,
  nodeRegistry?: AppNodeRegistry,
): Record<string, string> {
  if (!nodeRegistry) return {}
  const deps: Record<string, string> = {}
  for (const node of ir.nodes) {
    const def = nodeRegistry.registry.get(node.type)
    if (def?.dependencies) {
      Object.assign(deps, def.dependencies)
    }
  }
  return deps
}

function mergeDependencies(
  workflowDeps: Record<string, string> | undefined,
  nodeDeps: Record<string, string>,
): Record<string, string> | undefined {
  const merged = { ...nodeDeps, ...workflowDeps }
  return Object.keys(merged).length > 0 ? merged : undefined
}

const deploySchema = z.object({
  connectionId: z.string().min(1),
  versionId: z.string().min(1).optional(),
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

function createAdapter(templateResolver?: TemplateResolver) {
  return new CloudflareWorkflowsAdapter(templateResolver ? { templateResolver } : undefined)
}

function collectRequiredEnvVars(ir: WorkflowIR, nodeRegistry?: AppNodeRegistry): string[] {
  if (!nodeRegistry) return []
  const required: string[] = []
  for (const node of ir.nodes) {
    const def = nodeRegistry.registry.get(node.type)
    if (!def) continue
    for (const field of Object.values(def.configSchema)) {
      if (field.type === 'secret' && field.envVarName) {
        required.push(field.envVarName)
      }
    }
  }
  return [...new Set(required)]
}

async function resolveAndValidateEnvVars(
  db: DatabaseAdapter,
  organizationId: string,
  projectId: string,
  workflowId: string,
  ir: WorkflowIR,
  nodeRegistry?: AppNodeRegistry,
): Promise<{ envVars?: ProviderConfig['envVars']; error?: string }> {
  const resolved = await db.resolveEnvVars(organizationId, projectId, workflowId)
  const requiredNames = collectRequiredEnvVars(ir, nodeRegistry)

  const missing: string[] = []
  for (const name of requiredNames) {
    const entry = resolved[name]
    if (!entry || entry.value === undefined) {
      missing.push(name)
    }
  }

  for (const [name, entry] of Object.entries(resolved)) {
    if (entry.value === undefined) {
      missing.push(name)
    }
  }

  if (missing.length > 0) {
    const unique = [...new Set(missing)]
    return { error: `Missing or unresolved environment variables: ${unique.join(', ')}` }
  }

  if (Object.keys(resolved).length === 0) return {}

  const envVars: Record<string, { value: string; isSecret: boolean }> = {}
  for (const [name, entry] of Object.entries(resolved)) {
    envVars[name] = { value: entry.value!, isSecret: entry.isSecret }
  }
  return { envVars }
}

export const deploy = new Hono<AppEnv>()

deploy.post('/:workflowId/deploy', zValidator('json', deploySchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  if (await db.isActiveDeploymentLocked(workflow.id)) {
    return c.json(
      { error: 'Currently deployed version is locked — unlock it before deploying' },
      400,
    )
  }

  const connection = await db.getProviderConnectionById(body.connectionId)
  if (!connection || connection.organizationId !== organizationId)
    return c.json({ error: 'Connection not found' }, 404)

  const versionId = body.versionId ?? workflow.currentVersionId
  if (!versionId) return c.json({ error: 'No version to deploy' }, 400)

  const version = await db.getWorkflowVersionById(versionId)
  if (!version || version.workflowId !== workflow.id)
    return c.json({ error: 'Version not found' }, 404)

  if (version.locked === 1) {
    return c.json({ error: 'Version is locked' }, 400)
  }

  const nodeRegistry = c.get('nodeRegistry')
  const adapter = createAdapter(nodeRegistry?.templateResolver)
  const creds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }

  const ir = JSON.parse(version.ir) as WorkflowIR
  const validation = adapter.validate(ir)
  if (!validation.ok) {
    return c.json({ error: 'IR validation failed', details: validation.errors }, 400)
  }

  const envResult = await resolveAndValidateEnvVars(
    db,
    organizationId,
    projectId,
    workflow.id,
    ir,
    nodeRegistry,
  )
  if (envResult.error) {
    return c.json({ error: envResult.error }, 400)
  }

  const workflowDeps = parseDependencies(workflow.dependencies)
  const nodeDeps = collectNodeDependencies(ir, nodeRegistry)
  const deps = mergeDependencies(workflowDeps, nodeDeps)
  const appName = c.get('appName')
  const providerConfig: ProviderConfig = {
    provider: 'cloudflare-workflows',
    credentials: creds,
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      ...(deps && { dependencies: deps }),
      ...(appName && { packageName: appName }),
    },
    envVars: envResult.envVars,
  }

  const credCheck = await adapter.verifyCredentials(providerConfig)
  if (!credCheck.valid) {
    return c.json({ error: credCheck.error }, 403)
  }

  const artifact = adapter.generate(ir, providerConfig)
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
  })

  return c.json(result, result.success ? 200 : 500)
})

deploy.post('/:workflowId/deploy-stream', zValidator('json', deploySchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  if (await db.isActiveDeploymentLocked(workflow.id)) {
    return c.json(
      { error: 'Currently deployed version is locked — unlock it before deploying' },
      400,
    )
  }

  const connection = await db.getProviderConnectionById(body.connectionId)
  if (!connection || connection.organizationId !== organizationId)
    return c.json({ error: 'Connection not found' }, 404)

  const versionId = body.versionId ?? workflow.currentVersionId
  if (!versionId) return c.json({ error: 'No version to deploy' }, 400)

  const version = await db.getWorkflowVersionById(versionId)
  if (!version || version.workflowId !== workflow.id)
    return c.json({ error: 'Version not found' }, 404)

  if (version.locked === 1) {
    return c.json({ error: 'Version is locked' }, 400)
  }

  const nodeRegistry = c.get('nodeRegistry')
  const adapter = createAdapter(nodeRegistry?.templateResolver)
  const streamCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }

  const ir = JSON.parse(version.ir) as WorkflowIR
  const validation = adapter.validate(ir)
  if (!validation.ok) {
    return c.json({ error: 'IR validation failed', details: validation.errors }, 400)
  }

  const envResult = await resolveAndValidateEnvVars(
    db,
    organizationId,
    projectId,
    workflow.id,
    ir,
    nodeRegistry,
  )
  if (envResult.error) {
    return c.json({ error: envResult.error }, 400)
  }

  const streamWorkflowDeps = parseDependencies(workflow.dependencies)
  const streamNodeDeps = collectNodeDependencies(ir, nodeRegistry)
  const streamDeps = mergeDependencies(streamWorkflowDeps, streamNodeDeps)
  const streamAppName = c.get('appName')
  const providerConfig: ProviderConfig = {
    provider: 'cloudflare-workflows',
    credentials: streamCreds,
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      ...(streamDeps && { dependencies: streamDeps }),
      ...(streamAppName && { packageName: streamAppName }),
    },
    envVars: envResult.envVars,
  }

  const credCheck = await adapter.verifyCredentials(providerConfig)
  if (!credCheck.valid) {
    return c.json({ error: credCheck.error }, 403)
  }

  return streamSSE(c, async (stream) => {
    let eventId = 0
    const result = await adapter.deployWithProgress(artifact, providerConfig, async (progress) => {
      await stream.writeSSE({
        id: String(eventId++),
        event: 'progress',
        data: JSON.stringify(progress),
      })
    })

    await db.createDeployment({
      id: nanoid(),
      workflowId: workflow.id,
      versionId,
      connectionId,
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
  const organizationId = c.get('organizationId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  if (!workflow.currentVersionId) return c.json({ error: 'No version deployed' }, 400)

  const connection = await db.getProviderConnectionById(body.connectionId)
  if (!connection || connection.organizationId !== organizationId)
    return c.json({ error: 'Connection not found' }, 404)

  const adapter = resolveProvider(undefined, {
    templateResolver: c.get('nodeRegistry')?.templateResolver,
  })
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

deploy.post(
  '/:workflowId/takedown',
  zValidator('json', z.object({ connectionId: z.string().min(1) })),
  async (c) => {
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const workflow = c.get('workflow')
    if (!workflow) return c.json({ error: 'Not found' }, 404)

    const { connectionId } = c.req.valid('json')

    const connection = await db.getProviderConnectionById(connectionId)
    if (!connection || connection.organizationId !== organizationId)
      return c.json({ error: 'Connection not found' }, 404)

    const name = workerName(workflow.id)
    const creds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
    const adapter = createAdapter(c.get('nodeRegistry')?.templateResolver)
    const result = await adapter.destroy(name, {
      provider: 'cloudflare-workflows',
      credentials: creds,
    })

    if (result.success) {
      await db.deleteDeploymentsByWorkflow(workflow.id)
      await db.updateWorkflow(workflow.id, { currentVersionId: null })
    }

    return c.json(result, result.success ? 200 : 500)
  },
)
