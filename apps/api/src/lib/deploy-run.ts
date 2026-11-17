import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import type { DeployProgressEvent, DeployResult } from '@awaitstep/codegen'
import { STALE_DEPLOY_MS, type SettledDeploymentStatus, type Workflow } from '@awaitstep/db'
import { sharedDeployGroupKey } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'
import type { DeployContext } from './deploy-prepare.js'
import { auditActor, recordAudit } from './audit.js'
import { notify } from './notify.js'
import { createLogger } from './logger.js'

const log = createLogger('deploy')

/** How often a running deploy reads its own row for a cancel. */
export const CANCEL_POLL_MS = 2_000

/** What a deploy that crashed inside the provider says: no internals, an id to look it up by. */
export function unexpectedDeployFailure(requestId: string | undefined): string {
  return requestId
    ? `The deploy failed unexpectedly. Error ID ${requestId}.`
    : 'The deploy failed unexpectedly.'
}

export interface DeployRunHooks {
  /** The deployment row exists: its id, before any deploy work starts. */
  onStarted?: (deploymentId: string) => Promise<void>
  onProgress?: (progress: DeployProgressEvent) => Promise<void>
  /** Overrides {@link CANCEL_POLL_MS}; tests only. */
  pollMs?: number
}

/**
 * Runs one prepared deploy end to end: records it as it starts, deploys it
 * while watching its row for a cancel, and settles the row with how it
 * ended. A cancel asked for before the upload aborts the provider's work; the
 * upload itself is never interrupted. Never throws for a provider failure —
 * that, a crash inside the provider and a cancel all come back as the result.
 */
export async function runDeploy(
  c: Context<AppEnv>,
  workflow: Workflow,
  prepared: DeployContext,
  hooks: DeployRunHooks = {},
): Promise<{ deploymentId: string; result: DeployResult }> {
  const db = c.get('db')
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

  const deploymentId = nanoid()
  await db.startDeployment(
    {
      id: deploymentId,
      workflowId: workflow.id,
      versionId,
      versionNumber: prepared.versionNumber,
      connectionId,
      configSnapshot: deploymentSnapshot,
      createdBy: c.get('userId'),
      libraryVersions: prepared.library,
    },
    new Date(Date.now() - STALE_DEPLOY_MS).toISOString(),
  )

  const controller = new AbortController()
  const stopWatching = watchForCancel(c, deploymentId, controller, hooks.pollMs ?? CANCEL_POLL_MS)

  // The page may already be gone: telling it never decides the deploy.
  await hooks.onStarted?.(deploymentId).catch(() => {})

  let result: DeployResult
  try {
    result = await adapter.deploy(bundle, providerConfig, {
      onProgress: (progress) => {
        hooks.onProgress?.(progress).catch(() => {})
      },
      signal: controller.signal,
      // The race with a cancel is settled in this one conditional update: it
      // fails when the row already says `cancelling`.
      beforeUpload: () => db.markDeploymentUploading(deploymentId),
    })
  } catch (err) {
    // Adapter contract is to return DeployResult; an uncaught exception is
    // a provider bug. Its text (bundler output, paths, upstream errors) goes
    // to the log; the caller and the deployment row get a generic reason with
    // the request id to find it. The error itself as the data, so the log
    // keeps its stack (the logger serialises a top-level Error only).
    const requestId = c.get('requestId')
    log.error(`Provider deploy threw (request ${requestId ?? '-'}, workflow ${workflow.id})`, err)
    result = { success: false, deploymentId: '', error: unexpectedDeployFailure(requestId) }
  } finally {
    stopWatching()
  }

  const status: SettledDeploymentStatus = result.cancelled
    ? 'cancelled'
    : result.success
      ? 'success'
      : 'failed'
  try {
    await db.settleDeployment(deploymentId, {
      status,
      serviceName: result.deploymentId || '',
      serviceUrl: result.url,
      deployedName: result.deployedName,
      error: result.error,
    })
  } catch (err) {
    // The deploy happened (or didn't) whatever the row says: the caller still
    // gets the result. An unsettled row reads as interrupted once it is stale.
    log.error(`Could not settle deploy ${deploymentId} as ${status}`, err)
  }

  if (status === 'success') {
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
  // A cancel is recorded by the cancel request: its actor is who asked, not
  // who started the deploy.

  return { deploymentId, result }
}

/**
 * Reads the deploy's row every `pollMs` and aborts `controller` once a cancel
 * was asked for. The row, not memory, carries the cancel, so it reaches the
 * deploy whichever server instance or isolate took the cancel request.
 * Returns the function that stops watching.
 */
function watchForCancel(
  c: Context<AppEnv>,
  deploymentId: string,
  controller: AbortController,
  pollMs: number,
): () => void {
  const db = c.get('db')
  let reading = false
  const timer = setInterval(() => {
    if (reading || controller.signal.aborted) return
    reading = true
    db.readDeploymentStatus(deploymentId)
      .then((status) => {
        if (status === 'cancelling') controller.abort()
      })
      .catch((err: unknown) => {
        // A missed read only delays the cancel to the next one.
        log.warn(`Could not read deploy ${deploymentId} for a cancel`, err)
      })
      .finally(() => {
        reading = false
      })
  }, pollMs)
  return () => clearInterval(timer)
}

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
