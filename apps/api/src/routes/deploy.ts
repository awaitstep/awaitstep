import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { CloudflareWorkflowsAdapter, workerName } from '@awaitstep/provider-cloudflare'
import type { TemplateResolver, ProviderConfig } from '@awaitstep/codegen'
import type { WorkflowIR } from '@awaitstep/ir'
import type { DatabaseAdapter } from '@awaitstep/db'
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

const deploySchema = z.object({
  connectionId: z.string().min(1),
  versionId: z.string().min(1).optional(),
})

const MAX_TRIGGER_PARAMS_BYTES = 102_400 // 100 KB

const triggerSchema = z.object({
  connectionId: z.string().min(1),
  params: z.unknown().optional().refine(
    (val) => val === undefined || JSON.stringify(val).length <= MAX_TRIGGER_PARAMS_BYTES,
    { message: `Trigger params must be under ${MAX_TRIGGER_PARAMS_BYTES / 1024} KB` },
  ),
})

function createAdapter(templateResolver?: TemplateResolver) {
  return new CloudflareWorkflowsAdapter(
    templateResolver ? { templateResolver } : undefined,
  )
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
  userId: string,
  workflowId: string,
  ir: WorkflowIR,
  nodeRegistry?: AppNodeRegistry,
): Promise<{ envVars?: ProviderConfig['envVars']; error?: string }> {
  const resolved = await db.resolveEnvVars(userId, workflowId)
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

  const nodeRegistry = c.get('nodeRegistry')
  const adapter = createAdapter(nodeRegistry?.templateResolver)
  const creds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }

  const ir = JSON.parse(version.ir) as WorkflowIR
  const validation = adapter.validate(ir)
  if (!validation.ok) {
    return c.json({ error: 'IR validation failed', details: validation.errors }, 400)
  }

  const envResult = await resolveAndValidateEnvVars(db, userId, workflow.id, ir, nodeRegistry)
  if (envResult.error) {
    return c.json({ error: envResult.error }, 400)
  }

  const deps = parseDependencies(workflow.dependencies)
  const providerConfig: ProviderConfig = {
    provider: 'cloudflare-workflows',
    credentials: creds,
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      ...(deps && { dependencies: deps }),
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
    connectionId: body.connectionId,
    serviceName: result.deploymentId || '',
    serviceUrl: result.url,
    status: result.success ? 'success' : 'failed',
    error: result.error,
  })

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

  const nodeRegistry = c.get('nodeRegistry')
  const adapter = createAdapter(nodeRegistry?.templateResolver)
  const streamCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }

  const ir = JSON.parse(version.ir) as WorkflowIR
  const validation = adapter.validate(ir)
  if (!validation.ok) {
    return c.json({ error: 'IR validation failed', details: validation.errors }, 400)
  }

  const envResult = await resolveAndValidateEnvVars(db, userId, workflow.id, ir, nodeRegistry)
  if (envResult.error) {
    return c.json({ error: envResult.error }, 400)
  }

  const streamDeps = parseDependencies(workflow.dependencies)
  const providerConfig: ProviderConfig = {
    provider: 'cloudflare-workflows',
    credentials: streamCreds,
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      ...(streamDeps && { dependencies: streamDeps }),
    },
    envVars: envResult.envVars,
  }

  const credCheck = await adapter.verifyCredentials(providerConfig)
  if (!credCheck.valid) {
    return c.json({ error: credCheck.error }, 403)
  }

  return streamSSE(c, async (stream) => {
    const artifact = adapter.generate(ir, providerConfig)

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

  const adapter = createAdapter(c.get('nodeRegistry')?.templateResolver)
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
})
