import { nanoid } from 'nanoid'
import { resolveStepNode } from '@awaitstep/codegen'
import type { ProviderConfig, StepManifest, WorkflowProvider } from '@awaitstep/codegen'
import type { ActiveRunForSync, DatabaseAdapter, UpsertRunStepData } from '@awaitstep/db'
import { resolveProvider } from './provider-resolver.js'
import { createLogger } from './logger.js'

const log = createLogger('run-sync')

export interface RunSyncOptions {
  provider?: WorkflowProvider
  limit?: number
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
          syncRun(db, provider, connection.provider, credentials, entry).catch((err) => {
            log.warn('Run sync failed', {
              runId: entry.run.id,
              error: err instanceof Error ? err.message : String(err),
            })
          }),
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

async function syncRun(
  db: DatabaseAdapter,
  provider: WorkflowProvider,
  providerName: string,
  credentials: Record<string, string>,
  entry: ActiveRunForSync,
): Promise<void> {
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
  if (Object.keys(updates).length > 0) {
    await db.updateRun(run.id, updates)
  }

  if (detail.steps.length === 0) return
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
}

function parseStepManifest(configSnapshot: string | null): StepManifest | undefined {
  if (!configSnapshot) return undefined
  try {
    const parsed = JSON.parse(configSnapshot) as { stepManifest?: StepManifest }
    return parsed.stepManifest && Array.isArray(parsed.stepManifest.steps)
      ? parsed.stepManifest
      : undefined
  } catch {
    return undefined
  }
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
