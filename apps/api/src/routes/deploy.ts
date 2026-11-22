import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import type { DeployResult, DeployConfigResponse } from '@awaitstep/codegen'
import type { Workflow } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import { recordAudit } from '../lib/audit.js'
import { deploymentPageRecord } from '../lib/list-records.js'
import { runDetailRecord } from '../lib/run-records.js'
import { callFunction } from './function-call.js'
import {
  callBody,
  MAX_RUN_PAYLOAD_BYTES,
  runStartDeps,
  startWorkflowRun,
  type RunPayload,
} from '../lib/run-start.js'
import { withFreshInstanceId } from '../lib/run-request.js'
import { resolveProvider } from '../lib/provider-resolver.js'
import { prepareDeploy, isDeployError, CONNECTION_NOT_SERVING } from '../lib/deploy-prepare.js'
import { runDeploy } from '../lib/deploy-run.js'
import { deployConnections } from '../lib/connection-fields.js'
import { liveDeploymentRecords } from '../lib/live-deployments.js'

export { unexpectedDeployFailure } from '../lib/deploy-run.js'

const deploySchema = z.object({
  connectionId: z.string().min(1),
  versionId: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})

const triggerSchema = z.object({
  connectionId: z.string().min(1),
  params: z
    .unknown()
    .optional()
    .refine((val) => val === undefined || JSON.stringify(val).length <= MAX_RUN_PAYLOAD_BYTES, {
      message: `Trigger params must be under ${MAX_RUN_PAYLOAD_BYTES / 1024} KB`,
    }),
})

/**
 * A deploy's result as the page reads it: the name runs are found under stays
 * with the row, and the worker's URL on the server (D-8) — the API runs it.
 */
export function deployAnswer(result: DeployResult): Omit<DeployResult, 'deployedName' | 'url'> {
  const { deployedName: _stored, url: _url, ...answer } = result
  return answer
}

/** Why a cancel was refused, by what the deployment's row said. */
export const CANCEL_TOO_LATE = 'Already uploading to Cloudflare — it can’t be stopped now.'
export const CANCEL_FINISHED = 'This deploy has already finished.'
export const CANCEL_INTERRUPTED =
  'This deploy stopped without finishing; there is nothing to cancel.'
/** The `error` of a deploy answered as cancelled. */
export const DEPLOY_CANCELLED = 'Deploy cancelled'

export const deploy = new Hono<AppEnv>()

deploy.post('/:workflowId/deploy', zValidator('json', deploySchema), async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  const prepared = await prepareDeploy({
    db: c.get('db'),
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

  const { deploymentId: id, result } = await runDeploy(c, workflow, prepared)
  // A cancel (from another request, for this one) is an answer, not a fault.
  if (result.cancelled) {
    return c.json({ ...deployAnswer(result), id, error: DEPLOY_CANCELLED }, 409)
  }
  return c.json({ ...deployAnswer(result), id }, result.success ? 200 : 500)
})

deploy.post('/:workflowId/deploy-stream', zValidator('json', deploySchema), async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')

  const prepared = await prepareDeploy({
    db: c.get('db'),
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

  // Leaving the page doesn't stop the deploy: only a cancel does. The stream
  // carries the deployment's id first, which is what a cancel is asked by.
  return streamSSE(c, async (stream) => {
    let eventId = 0
    const { result } = await runDeploy(c, workflow, prepared, {
      onStarted: async (deploymentId) => {
        await stream.writeSSE({
          id: String(eventId++),
          event: 'started',
          data: JSON.stringify({ deploymentId }),
        })
      },
      onProgress: async (progress) => {
        await stream.writeSSE({
          id: String(eventId++),
          event: 'progress',
          data: JSON.stringify(progress),
        })
      },
    })
    await stream.writeSSE({
      id: String(eventId++),
      event: 'result',
      data: JSON.stringify(deployAnswer(result)),
    })
  })
})

/**
 * Asks a running deploy of this workflow to stop. It stops before it uploads:
 * 202 once asked (the deploy's own stream, or its row, says when it ended);
 * 409 once the upload started or the deploy finished; 404 for a deployment
 * that isn't this workflow's.
 */
deploy.post('/:workflowId/deployments/:deploymentId/cancel', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const userId = c.get('userId') ?? null
  const answer = await c
    .get('db')
    .requestDeploymentCancel(workflow.id, c.req.param('deploymentId'), userId)
  if (answer.outcome === 'not_found') return c.json({ error: 'Not found' }, 404)
  if (answer.outcome === 'uploading') return c.json({ error: CANCEL_TOO_LATE }, 409)
  if (answer.outcome === 'finished') return c.json({ error: CANCEL_FINISHED }, 409)
  if (answer.outcome === 'interrupted') return c.json({ error: CANCEL_INTERRUPTED }, 409)
  // Recorded here, by the request that asked: its actor is the canceller. Only
  // by the ask that stopped it; asking again records nothing more.
  if (answer.asked) {
    await recordAudit(c, {
      event: 'workflow.deploy_cancel',
      facts: {
        name: workflow.name,
        ...(answer.versionNumber !== null && { version: answer.versionNumber }),
      },
      projectId: workflow.projectId,
      workspaceId: workflow.workspaceId,
    })
  }
  return c.json({ status: 'cancelling' as const }, 202)
})

/** The accounts Deploy offers this workflow: its project's, its workspace's (else the project's) default chosen. */
deploy.get('/:workflowId/deploy-connections', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const db = c.get('db')
  const [rows, deployedWith] = await Promise.all([
    db.listDeployTargets(workflow.projectId, workflow.workspaceId),
    db.listLiveDeployments(workflow.id),
  ])
  return c.json(deployConnections(rows, liveDeploymentRecords(deployedWith)))
})

deploy.get('/:workflowId/deploy-config/:connectionId', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const connectionId = c.req.param('connectionId')

  const found = await db.getDeployConfigFor(
    connectionId,
    c.get('organizationId'),
    workflow.projectId,
    workflow.id,
  )
  if (!found) return c.json({ error: 'Connection not found' }, 404)
  if (!found.covered) return c.json({ error: CONNECTION_NOT_SERVING }, 403)

  const adapter = resolveProvider(found.provider)
  const defaults = adapter.getDefaultDeploymentConfig(workflow.kind) as Record<string, unknown>
  let config: Record<string, unknown> = defaults
  if (found.config) {
    const raw = JSON.parse(found.config) as Record<string, unknown>
    delete raw.triggerCode
    const parsed = adapter.deploymentConfigSchema.safeParse(raw)
    if (parsed.success) config = parsed.data as Record<string, unknown>
  }
  const body: DeployConfigResponse = {
    config,
    defaults,
    provider: found.provider,
    preview: adapter.buildDeploymentConfigPreview(config),
    uiSchema: adapter.deploymentConfigUiSchema,
  }
  return c.json(body)
})

deploy.put(
  '/:workflowId/deploy-config/:connectionId',
  zValidator(
    'json',
    z.object({
      config: z.record(z.string(), z.unknown()),
    }),
  ),
  async (c) => {
    const db = c.get('db')
    const workflow = c.get('workflow')
    if (!workflow) return c.json({ error: 'Not found' }, 404)
    const connectionId = c.req.param('connectionId')
    const organizationId = c.get('organizationId')

    const found = await db.getConnectionForProject(connectionId, organizationId, workflow.projectId)
    if (!found) return c.json({ error: 'Connection not found' }, 404)
    if (!found.covered) return c.json({ error: CONNECTION_NOT_SERVING }, 403)
    const { connection } = found

    const adapter = resolveProvider(connection.provider)
    const stored = await db.getDeploymentConfig(workflow.id, connectionId)
    let base = adapter.getDefaultDeploymentConfig(workflow.kind) as Record<string, unknown>
    if (stored) {
      const raw = JSON.parse(stored.config) as Record<string, unknown>
      delete raw.triggerCode
      const existing = adapter.deploymentConfigSchema.safeParse(raw)
      if (existing.success) base = existing.data as Record<string, unknown>
    }
    const incoming = c.req.valid('json').config
    const merged = {
      ...base,
      ...incoming,
      bindings: {
        ...((base.bindings as Record<string, unknown> | undefined) ?? {}),
        ...((incoming.bindings as Record<string, unknown> | undefined) ?? {}),
      },
    }
    const parsed = adapter.deploymentConfigSchema.safeParse(merged)
    if (!parsed.success) {
      return c.json({ error: 'Invalid deployment config', details: parsed.error }, 422)
    }

    await db.upsertDeploymentConfig({
      id: nanoid(),
      workflowId: workflow.id,
      connectionId,
      provider: connection.provider,
      config: JSON.stringify(parsed.data),
      updatedBy: c.get('userId'),
    })
    await recordAudit(c, {
      event: 'workflow.deploy_config',
      facts: {
        name: workflow.name,
        provider: connection.name,
        bindings: Object.entries(
          (
            parsed.data as {
              bindings?: Record<string, { resourceId?: string; resourceName?: string }>
            }
          ).bindings ?? {},
        )
          .map(([name, mapping]) => `${name}=${mapping.resourceId ?? mapping.resourceName ?? ''}`)
          .join(', '),
      },
      projectId: workflow.projectId,
      workspaceId: workflow.workspaceId,
    })
    return c.json({ config: parsed.data, provider: connection.provider })
  },
)

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

    const found = await db.getConnectionForProject(
      body.connectionId,
      organizationId,
      c.get('projectId'),
    )
    if (!found) {
      return c.json({ error: 'Connection not found' }, 404)
    }
    if (!found.covered) return c.json({ error: CONNECTION_NOT_SERVING }, 403)
    const { connection } = found

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
  return c.json(deploymentPageRecord(result))
})

deploy.post('/:workflowId/trigger', zValidator('json', triggerSchema), async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const { connectionId, params } = c.req.valid('json')
  return startRun(c, workflow, connectionId, async () => ({ params }))
})

/**
 * Starts a run again with the payload the given run was started with, on the
 * account it ran on (the client sends it; the run must have been started there).
 * A function's run is a call, and is called again with the same body.
 */
deploy.post(
  '/:workflowId/runs/:runId/run-again',
  zValidator('json', z.object({ connectionId: z.string().min(1) })),
  async (c) => {
    const db = c.get('db')
    const workflow = c.get('workflow')
    if (!workflow) return c.json({ error: 'Not found' }, 404)
    const { connectionId } = c.req.valid('json')
    const runId = c.req.param('runId')
    // A function's run is a call: call it again with the body it was sent, as it was typed.
    if (workflow.kind === 'script') {
      return callFunction(c, workflow, connectionId, async () => {
        const row = await db.getRunParams(runId, workflow.id, connectionId)
        if (!row) return null
        return {
          body: callBody(row.params),
          ...(row.contentType && { contentType: row.contentType }),
        }
      })
    }
    return startRun(c, workflow, connectionId, async () => {
      const row = await db.getRunParams(runId, workflow.id, connectionId)
      if (!row) return null
      // Kept with its type (it wasn't sent as JSON): it goes again with that type.
      if (row.contentType) return againAsSent(callBody(row.params), row.contentType)
      const params = row.params === null ? undefined : (JSON.parse(row.params) as unknown)
      // A new instance, so the run doesn't collide with the one it repeats.
      return { params: withFreshInstanceId(params) }
    })
  },
)

/**
 * A kept body sent again with its own type. Text that is JSON is read as the
 * run's params too (a named instance replaced, as for any Run again); other
 * text goes on as it is, for the workflow's own handler.
 */
function againAsSent(body: string, contentType: string): RunPayload {
  let params: unknown
  try {
    params = JSON.parse(body) as unknown
  } catch {
    return { params: undefined, notJson: true, body, contentType }
  }
  const fresh = withFreshInstanceId(params)
  return { params: fresh, body: fresh === params ? body : JSON.stringify(fresh), contentType }
}

/**
 * Starts a run of `workflow` on `connectionId` and answers it as the dashboard
 * reads it: the run (a call, when the workflow's own handler started nothing),
 * or `{ ok: true }` for the built-in send-event body.
 */
async function startRun(
  c: Context<AppEnv>,
  workflow: Workflow,
  connectionId: string,
  readPayload: () => Promise<RunPayload | null>,
) {
  const started = await startWorkflowRun(runStartDeps(c), { workflow, connectionId }, readPayload)
  if (!started.ok) return c.json({ error: started.error }, started.status)
  if (started.outcome === 'event-sent') return c.json({ ok: true as const })
  return c.json(runDetailRecord(started.run), 201)
}

deploy.post(
  '/:workflowId/takedown',
  zValidator('json', z.object({ connectionId: z.string().min(1) })),
  async (c) => {
    const db = c.get('db')
    const organizationId = c.get('organizationId')
    const workflow = c.get('workflow')
    if (!workflow) return c.json({ error: 'Not found' }, 404)

    const { connectionId } = c.req.valid('json')

    // Only an account the workflow went out with, as a trigger: with project-owned
    // accounts (23a) any other id in the org may be another project's (security review L1).
    const connection = await db.getConnectionDeployedWith(connectionId, organizationId, workflow.id)
    if (!connection) {
      return c.json({ error: 'This workflow isn’t deployed with that connection' }, 404)
    }

    // Rows written after this (a deploy finishing meanwhile) describe a live worker.
    const startedAt = new Date().toISOString()
    const creds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
    const adapter = resolveProvider(connection.provider, {
      templateResolver: c.get('nodeRegistry')?.templateResolver,
    })
    const name = adapter.deploymentName?.(workflow.id) ?? workflow.id
    const result = await adapter.destroy(name, {
      provider: connection.provider,
      credentials: creds,
    })

    if (result.success) {
      // Only this account's rows, kept as its history: the workflow may still be live
      // on another. The latest saved version (`currentVersionId`) is the editor's.
      await db.takeDownDeploymentsOnConnection(
        workflow.id,
        connectionId,
        startedAt,
        c.get('userId'),
      )
      await recordAudit(c, {
        event: 'workflow.takedown',
        facts: {
          name: workflow.name,
          provider: connection.name,
        },
        projectId: workflow.projectId,
        workspaceId: workflow.workspaceId,
      })
    }

    return c.json(result, result.success ? 200 : 500)
  },
)
