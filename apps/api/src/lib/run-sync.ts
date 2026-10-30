import { nanoid } from 'nanoid'
import { resolveStepNode } from '@awaitstep/codegen'
import type { ProviderConfig, WorkflowProvider, WorkflowRunDetail } from '@awaitstep/codegen'
import type { ActiveRunForSync, DatabaseAdapter, UpsertRunStepData } from '@awaitstep/db'
import { runFailureGroupKey } from '@awaitstep/ir'
import type { AppEmails } from '../types.js'
import { emailEach, sendNotice } from './notify.js'
import { resolveProvider } from './provider-resolver.js'
import { parseStepManifest } from './step-manifest.js'
import { createLogger } from './logger.js'

const log = createLogger('run-sync')

export interface RunSyncOptions {
  provider?: WorkflowProvider
  limit?: number
  /** Emails a failing workflow's watchers; without it the Inbox alone is told. */
  emails?: AppEmails
}

/**
 * One reconciliation tick: pull every active run's instance detail from the
 * provider, update run status, and upsert per-step telemetry mapped back to
 * nodes through the deployed version's step manifest. API reads stay pure
 * DB queries; this is the only place run state crosses the provider.
 *
 * Runs are fetched with their workflow name and deploy snapshot in a single
 * JOIN; the per-connection credential fetch stays separate because
 * credentials decrypt through the connections adapter, once per connection.
 */
export async function syncActiveRuns(db: DatabaseAdapter, options?: RunSyncOptions): Promise<void> {
  const provider = options?.provider ?? resolveProvider()
  if (!provider.getRunDetail) return

  const active = await db.listActiveRunsForSync(options?.limit)
  const byConnection = new Map<string, ActiveRunForSync[]>()
  for (const entry of active) {
    if (!entry.run.connectionId || !entry.run.instanceId) continue
    const group = byConnection.get(entry.run.connectionId) ?? []
    group.push(entry)
    byConnection.set(entry.run.connectionId, group)
  }

  for (const [connectionId, group] of byConnection) {
    try {
      const connection = await db.getProviderConnectionById(connectionId)
      if (!connection) continue
      const credentials = JSON.parse(connection.credentials) as Record<string, string>
      await Promise.all(
        group.map((entry) =>
          syncRun(db, provider, connection.provider, credentials, entry, options?.emails).catch(
            (err) => {
              log.warn('Run sync failed', {
                runId: entry.run.id,
                error: err instanceof Error ? err.message : String(err),
              })
            },
          ),
        ),
      )
    } catch (err) {
      log.warn('Connection sync failed', {
        connectionId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/**
 * Reconciles one run on demand (the live stream's tick). Returns the
 * provider detail so the caller can diff it, or null when the run has no
 * connection to reach the provider through.
 */
export async function syncRunById(
  db: DatabaseAdapter,
  runId: string,
  workflowId: string,
  options?: RunSyncOptions,
): Promise<WorkflowRunDetail | null> {
  const provider = options?.provider ?? resolveProvider()
  if (!provider.getRunDetail) return null
  const entry = await db.getRunForSync(runId, workflowId)
  if (!entry?.run.connectionId || !entry.run.instanceId) return null
  const connection = await db.getProviderConnectionById(entry.run.connectionId)
  if (!connection) return null
  const credentials = JSON.parse(connection.credentials) as Record<string, string>
  return syncRun(db, provider, connection.provider, credentials, entry, options?.emails)
}

async function syncRun(
  db: DatabaseAdapter,
  provider: WorkflowProvider,
  providerName: string,
  credentials: Record<string, string>,
  entry: ActiveRunForSync,
  emails?: AppEmails,
): Promise<WorkflowRunDetail> {
  const { run, workflowName } = entry
  const config: ProviderConfig = {
    provider: providerName,
    credentials,
    options: { workflowName },
  }
  const detail = await provider.getRunDetail!(run.instanceId, config)

  const updates: { status?: string; output?: string; error?: string; updatedAt?: string } = {}
  if (detail.status !== 'unknown' && detail.status !== run.status) updates.status = detail.status
  if (detail.output !== undefined && detail.output !== null) {
    updates.output = JSON.stringify(detail.output)
  }
  if (detail.error) updates.error = JSON.stringify(detail.error)
  if (detail.endedAt) updates.updatedAt = detail.endedAt
  if (updates.status) {
    // Moved only from the status this sync read: of two syncs seeing the
    // same change (the tick and a live stream), one moves it and tells.
    const moved = await db.updateRunFromStatus(run.id, run.status, {
      ...updates,
      status: updates.status,
    })
    if (moved && updates.status === 'errored') await tellRunFailed(db, entry, detail, emails)
  } else if (Object.keys(updates).length > 0) {
    await db.updateRun(run.id, updates)
  }

  if (detail.steps.length === 0) return detail
  const manifest = parseStepManifest(entry.configSnapshot)
  const rows: UpsertRunStepData[] = detail.steps.map((step) => ({
    id: nanoid(),
    nodeId: (manifest && resolveStepNode(manifest, step.name)) ?? null,
    stepName: step.name,
    kind: step.kind,
    stepIndex: step.index,
    status: step.status,
    attemptCount: step.attemptCount,
    error: step.error ? JSON.stringify(step.error) : null,
    startedAt: step.start ?? null,
    endedAt: step.end ?? null,
  }))
  await db.upsertRunSteps(run.id, rows)
  return detail
}

/** The step a failed run stopped at: the last one that errored. */
function failedStep(detail: WorkflowRunDetail): string | null {
  const errored = detail.steps.filter((step) => step.status === 'errored')
  return errored[errored.length - 1]?.name ?? null
}

/**
 * A run failed: its workflow's creator and its workspace's admins hear of it,
 * failures of one workflow folding into one row an hour. Only a new row is
 * emailed, so a flapping workflow mails each person at most once an hour.
 */
async function tellRunFailed(
  db: DatabaseAdapter,
  entry: ActiveRunForSync,
  detail: WorkflowRunDetail,
  emails: AppEmails | undefined,
): Promise<void> {
  const { place } = entry
  if (!place.organizationId) return
  const step = failedStep(detail)
  const now = new Date()
  const reached = await sendNotice(
    db,
    {
      event: 'run.failed',
      organizationId: place.organizationId,
      projectId: place.projectId,
      workspaceId: place.workspaceId,
      groupKey: runFailureGroupKey(entry.run.workflowId, now),
      meta: { workflow: entry.workflowName, ...(step && { step }) },
      recipients: { workflowWatchers: { workflowId: entry.run.workflowId } },
      onRepeat: 'fold',
    },
    now,
  )
  if (!emails || !place.orgSlug || !place.projectSlug || !place.workspaceSlug) return
  const url = emails.runsUrl({
    org: place.orgSlug,
    project: place.projectSlug,
    workspace: place.workspaceSlug,
  })
  const placeName = [place.projectName, place.workspaceName].filter(Boolean).join(' · ')
  await emailEach(
    reached.filter((to) => to.count === 1),
    (to) =>
      emails.sendRunFailed({
        to: to.email,
        url,
        workflowName: entry.workflowName,
        stepName: step,
        placeName,
      }),
  )
}

/**
 * Interval driver for long-lived Node processes. Ticks never overlap: a
 * slow provider round-trip skips beats instead of stacking calls.
 */
export function startRunSyncLoop(
  db: DatabaseAdapter,
  intervalMs: number,
  options?: RunSyncOptions,
): () => void {
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    syncActiveRuns(db, options)
      .catch((err) => {
        log.error('Run sync tick failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        running = false
      })
  }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
  return () => clearInterval(timer)
}
