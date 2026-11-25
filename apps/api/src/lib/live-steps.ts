import { resolveStepNode, RunGoneError } from '@awaitstep/codegen'
import type { RunStepDetail, WorkflowProvider, WorkflowRunDetail } from '@awaitstep/codegen'
import type {
  ActiveRunForSync,
  DatabaseAdapter,
  RunStepExtras,
  RunStepListRow,
} from '@awaitstep/db'
import { hasLiveStepProviders, isLiveStepProvider } from './provider-registry.js'
import { resolveProvider } from './provider-resolver.js'
import { runProviderConfig, storedOutput } from './run-sync.js'
import { coalescedMembers, parseStepManifest } from './step-manifest.js'

/** Shown when the provider cannot be read right now; the steps are still there. */
export const STEPS_UNAVAILABLE = 'Step detail can’t be read right now. Try again in a moment.'

const LIVE_ID = /^live-(\d+)$/

/** Whether a step id names a step read live, not a stored row. */
export function isLiveStepId(stepId: string): boolean {
  return LIVE_ID.test(stepId)
}

export interface LiveSteps {
  data: RunStepListRow[]
  coalescedInto: Record<string, string>
  /** Why there are no steps to show, when the provider has none to give. */
  notice?: string
  /** The steps are there but could not be read this time: a page keeps the ones it has. */
  unavailable?: true
}

interface LiveRun {
  provider: WorkflowProvider
  entry: ActiveRunForSync
  /** `gone` once the provider no longer keeps the run. */
  detail: WorkflowRunDetail | 'gone'
}

/**
 * The run with its steps as its provider has them now, when that provider's
 * steps are read live; null for any other run (its steps are stored rows).
 * The run, its account and its version's manifest come from one read.
 */
async function liveRun(
  db: DatabaseAdapter,
  runId: string,
  workflowId: string,
  organizationId: string,
  only?: WorkflowProvider,
): Promise<LiveRun | null> {
  if (!only && !hasLiveStepProviders()) return null
  // Another provider's account is not opened: its steps are stored rows, read by the caller.
  const found = await db.getRunForSyncWithAccount(
    runId,
    workflowId,
    organizationId,
    only ? undefined : isLiveStepProvider,
  )
  if (!found?.connection) return null
  const { entry, connection } = found
  const provider = only ?? resolveProvider(connection.provider)
  if (!provider.liveSteps || !provider.getRunDetail) return null
  if (!entry.run.instanceId) return { provider, entry, detail: 'gone' }
  const credentials = JSON.parse(connection.credentials) as Record<string, string>
  try {
    const detail = await provider.getRunDetail(
      entry.run.instanceId,
      runProviderConfig(connection.provider, credentials, entry),
    )
    return { provider, entry, detail }
  } catch (error) {
    if (!(error instanceof RunGoneError)) throw error
    return { provider, entry, detail: 'gone' }
  }
}

function rowOf(
  step: RunStepDetail,
  position: number,
  entry: ActiveRunForSync,
  manifest: ReturnType<typeof parseStepManifest>,
): RunStepListRow {
  const startedAt = step.start ?? null
  const endedAt = step.end ?? null
  return {
    id: `live-${position}`,
    runId: entry.run.id,
    nodeId: (manifest && resolveStepNode(manifest, step.name)) ?? null,
    stepName: step.name,
    kind: step.kind,
    stepIndex: step.index,
    status: step.status,
    attemptCount: step.attemptCount,
    error: step.error ? JSON.stringify(step.error) : null,
    startedAt,
    endedAt,
    createdAt: startedAt ?? entry.run.createdAt,
    updatedAt: endedAt ?? startedAt ?? entry.run.updatedAt,
  }
}

/**
 * A run's steps read from its provider, mapped to nodes as stored rows are;
 * null when this run's steps are stored (the caller reads them). Nothing is
 * written.
 */
export async function liveRunSteps(
  db: DatabaseAdapter,
  runId: string,
  workflowId: string,
  organizationId: string,
  only?: WorkflowProvider,
): Promise<LiveSteps | null> {
  const live = await liveRun(db, runId, workflowId, organizationId, only)
  if (!live) return null
  const manifest = parseStepManifest(live.entry.configSnapshot)
  const coalescedInto = coalescedMembers(manifest)
  if (live.detail === 'gone') {
    return { data: [], coalescedInto, notice: live.provider.liveSteps!.keptFor }
  }
  const { detail, entry } = live
  return {
    data: detail.steps.map((step, position) => rowOf(step, position, entry, manifest)),
    coalescedInto,
    ...(detail.stepsUnavailable && { notice: STEPS_UNAVAILABLE, unavailable: true as const }),
  }
}

/** One live step's output and tries; null when the provider no longer has it. */
export async function liveStepExtras(
  db: DatabaseAdapter,
  stepId: string,
  runId: string,
  workflowId: string,
  organizationId: string,
  only?: WorkflowProvider,
): Promise<RunStepExtras | null> {
  const position = Number(LIVE_ID.exec(stepId)?.[1])
  const live = await liveRun(db, runId, workflowId, organizationId, only)
  if (!live || live.detail === 'gone') return null
  const step = live.detail.steps[position]
  if (!step) return null
  return {
    ...storedOutput(step.output),
    attempts: step.attempts?.length ? JSON.stringify(step.attempts) : null,
  }
}
