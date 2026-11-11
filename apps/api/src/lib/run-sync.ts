import { nanoid } from 'nanoid'
import { resolveStepNode, RunGoneError } from '@awaitstep/codegen'
import type { ProviderConfig, WorkflowProvider, WorkflowRunDetail } from '@awaitstep/codegen'
import type {
  ActiveRunForSync,
  Connection,
  DatabaseAdapter,
  UpsertRunStepData,
} from '@awaitstep/db'
import type { AppEmails } from '../types.js'
import { tellRunFailed } from './run-failure.js'
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
 * Runs are fetched with their workflow name, deploy snapshot and account in
 * a single JOIN; each account's credentials decrypt once for its runs.
 */
export async function syncActiveRuns(db: DatabaseAdapter, options?: RunSyncOptions): Promise<void> {
  // The runs and their accounts in one read; each account decrypted once.
  const active = await db.listActiveRunsForSyncWithAccounts(options?.limit)
  const byConnection = new Map<string, { connection: Connection; entries: ActiveRunForSync[] }>()
  for (const { entry, connection } of active) {
    if (!entry.run.instanceId) continue
    // Its account was deleted, or isn't its workflow's organization's any more (a moved
    // project): nothing can reach the run again.
    if (!connection) {
      await closeRun(db, entry, ACCOUNT_GONE)
      continue
    }
    const group = byConnection.get(connection.id) ?? { connection, entries: [] }
    group.entries.push(entry)
    byConnection.set(connection.id, group)
  }

  for (const [connectionId, { connection, entries }] of byConnection) {
    try {
      const provider = options?.provider ?? resolveProvider(connection.provider)
      if (!provider.getRunDetail) continue
      const credentials = JSON.parse(connection.credentials) as Record<string, string>
      await Promise.all(
        entries.map((entry) =>
          syncRun(db, provider, connection.provider, credentials, entry, options?.emails).catch(
            async (err) => {
              if (err instanceof RunGoneError) return closeGoneRun(db, entry, err)
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
 * provider detail so the caller can diff it, or null when there is nothing
 * more to read: the run has no connection to reach the provider through, or
 * the provider no longer has it (closed here when it hadn't ended).
 */
export async function syncRunById(
  db: DatabaseAdapter,
  runId: string,
  workflowId: string,
  organizationId: string,
  options?: RunSyncOptions,
): Promise<WorkflowRunDetail | null> {
  // The run and its account in one read; the account only when it is the organization's.
  const found = await db.getRunForSyncWithAccount(runId, workflowId, organizationId)
  if (!found?.entry.run.connectionId || !found.entry.run.instanceId) return null
  const { entry, connection } = found
  if (!connection) return null
  const provider = options?.provider ?? resolveProvider(connection.provider)
  if (!provider.getRunDetail) return null
  const credentials = JSON.parse(connection.credentials) as Record<string, string>
  try {
    return await syncRun(db, provider, connection.provider, credentials, entry, options?.emails)
  } catch (err) {
    if (!(err instanceof RunGoneError)) throw err
    await closeGoneRun(db, entry, err)
    return null
  }
}

/** Runs that ended already: a gone answer about them changes nothing. */
const TERMINAL = new Set(['complete', 'errored', 'terminated'])

/** A run younger than this may not be known to the provider yet: a gone answer waits. */
const GONE_GRACE_MS = 60_000

/**
 * The provider no longer has the run (its workflow was taken down or deleted
 * there, or the instance's records were cleared): it can never move again,
 * so it is closed as errored, with the reason, instead of being asked about
 * every tick. Only a run that hasn't ended, and is old enough for the
 * provider to have known it; moved only from the status this sync read. No
 * run-failed notice — nothing ran and failed on its own account.
 */
async function closeGoneRun(
  db: DatabaseAdapter,
  entry: ActiveRunForSync,
  err: RunGoneError,
): Promise<void> {
  await closeRun(db, entry, { name: err.name, message: err.message })
}

/** Why a run whose account can't be reached any more was closed. */
const ACCOUNT_GONE = {
  name: 'AccountGone',
  message: 'The account this run used is no longer available.',
}

/** Closes a run that can't be followed any more as errored, with why — under the guards above. */
async function closeRun(
  db: DatabaseAdapter,
  entry: ActiveRunForSync,
  reason: { name: string; message: string },
  now = Date.now(),
): Promise<void> {
  const { run } = entry
  if (TERMINAL.has(run.status)) return
  if (now - Date.parse(run.createdAt) < GONE_GRACE_MS) return
  const moved = await db.updateRunFromStatus(run.id, run.status, {
    status: 'errored',
    error: JSON.stringify(reason),
    updatedAt: new Date(now).toISOString(),
  })
  if (moved)
    log.info('Closed a run that can no longer be followed', { runId: run.id, reason: reason.name })
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
    options: { workflowName: entry.deployedName ?? workflowName },
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
    if (moved && updates.status === 'errored') {
      await tellRunFailed(
        db,
        { place: entry.place, workflowId: entry.run.workflowId, workflowName: entry.workflowName },
        failedStep(detail),
        emails,
      )
    }
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
    ...storedOutput(step.output),
    attempts: step.attempts?.length ? JSON.stringify(step.attempts) : null,
  }))
  await db.upsertRunSteps(run.id, rows)
  return detail
}

/** A step's output is kept up to this many characters of JSON; past it, cut and flagged. */
export const STEP_OUTPUT_LIMIT = 64 * 1024

function storedOutput(output: unknown): { output: string | null; outputTruncated: boolean } {
  if (output === undefined || output === null) return { output: null, outputTruncated: false }
  let json: string
  try {
    json = JSON.stringify(output) ?? 'null'
  } catch {
    json = JSON.stringify(String(output))
  }
  if (json.length <= STEP_OUTPUT_LIMIT) return { output: json, outputTruncated: false }
  return { output: json.slice(0, STEP_OUTPUT_LIMIT), outputTruncated: true }
}

/** The step a failed run stopped at: the last one that errored. */
function failedStep(detail: WorkflowRunDetail): string | null {
  const errored = detail.steps.filter((step) => step.status === 'errored')
  return errored[errored.length - 1]?.name ?? null
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
