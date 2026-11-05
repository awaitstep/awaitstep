import { nanoid } from 'nanoid'
import { NO_VERSION_MESSAGE } from './blank-source.js'
import type { DatabaseAdapter, TestSession, Workflow } from '@awaitstep/db'
import {
  GenerateInputError,
  type TestSessionHandle,
  type TestSessionRunner,
} from '@awaitstep/codegen'
import { buildFileManifest } from '@awaitstep/ir'
import { splitEnvVars } from '@awaitstep/provider-cloudflare'
import type { AppNodeRegistry } from './node-registry.js'
import { prepareWorkflow, isPrepareError } from './workflow-prepare.js'
import {
  expiryMessage,
  quotaWindowStart,
  testSessionCutoffs,
  testSessionStartRefusal,
  type TestSessionLimits,
} from './test-session-policy.js'

/** Everything the session operations need, resolved once per request. */
export interface TestSessionDeps {
  db: DatabaseAdapter
  runner: TestSessionRunner
  limits: TestSessionLimits
}

export interface StartTestSessionInput extends TestSessionDeps {
  workflow: Workflow
  organizationId: string
  projectId: string
  userId: string
  nodeRegistry?: AppNodeRegistry
}

export type StartTestSessionResult =
  | { ok: true; session: TestSession }
  | { ok: false; status: number; error: string; details?: unknown }

const REAP_BATCH = 20

/** The handle a runner needs, rebuilt from the stored row. */
export function sessionHandle(session: TestSession): TestSessionHandle {
  return {
    sessionId: session.id,
    containerId: session.containerId,
    processId: session.processId,
    port: session.port,
  }
}

/**
 * Stops a session's worker and records that it is finished.
 *
 * The worker is stopped first and unconditionally: the row is bookkeeping,
 * the container is the thing that costs money. A row that cannot be updated
 * afterwards is a stale record; a container that is never stopped is a bill.
 */
export async function stopTestSession(
  deps: TestSessionDeps,
  session: TestSession,
  status: 'stopped' | 'failed',
  options: { error?: string; userId?: string } = {},
): Promise<void> {
  // A session that is already finished keeps its process id and port, and
  // both get reused: acting on them again would stop whatever holds them
  // now. The record is already right, so there is nothing left to do.
  if (session.status === 'stopped' || session.status === 'failed') return

  await deps.runner.stop(sessionHandle(session)).catch(() => {})
  await deps.db.markTestSessionStopped(session.id, status, {
    ...(options.error !== undefined && { error: options.error }),
    ...(options.userId !== undefined && { userId: options.userId }),
  })
}

/**
 * Stops every session past one of its cut-offs. Runs on the same interval
 * (or cron) as run sync, and again at the start of every new session: the
 * concurrency cap counts sessions that have not been stopped yet, so without
 * reaping first a user can be refused because of a session that should
 * already be gone.
 */
export async function reapTestSessions(
  deps: TestSessionDeps,
  options: { userId?: string; limit?: number } = {},
): Promise<number> {
  const cutoffs = testSessionCutoffs(deps.limits)
  const expired = await deps.db.listExpiredTestSessions(
    cutoffs,
    options.limit ?? REAP_BATCH,
    options.userId,
  )
  // In parallel: a start waits on this, and the teardowns are independent —
  // one at a time puts a container's worth of latency in front of the user
  // for every stale session in the batch.
  await Promise.allSettled(
    expired.map(({ session, expiry }) =>
      stopTestSession(deps, session, 'stopped', {
        ...(expiry && { error: expiryMessage(expiry) }),
      }),
    ),
  )
  return expired.length
}

/**
 * Stops every session for a workflow, whoever owns it — for a workflow about
 * to be deleted. Scoped to one user it would leave other members' containers
 * running with no route left to stop them: once the workflow is gone their
 * sessions answer 404 while still holding a concurrency slot.
 */
export async function stopWorkflowTestSessions(
  deps: TestSessionDeps,
  workflowId: string,
  reason: string,
): Promise<number> {
  const sessions = await deps.db.listUnfinishedTestSessionsForWorkflow(workflowId)
  await Promise.allSettled(
    sessions.map((session) => stopTestSession(deps, session, 'stopped', { error: reason })),
  )
  return sessions.length
}

/**
 * Starts a session: reap, reserve, run, publish.
 *
 * The order matters. The row is reserved before the container exists, so a
 * start that fails or never returns still leaves something the reaper can
 * find; the worker is published only once it answers. A reservation the
 * reaper has already written off cannot be activated, so the container it
 * belongs to is disposed instead of being left running under a dead row.
 */
export async function startTestSession(
  input: StartTestSessionInput,
): Promise<StartTestSessionResult> {
  const { db, runner, limits, workflow, projectId, userId } = input

  if (!workflow.currentVersionId) {
    return {
      ok: false,
      status: 400,
      error: NO_VERSION_MESSAGE,
    }
  }

  // This caller's expired sessions, not everyone's: a sweep of all of them
  // can fill its batch without reaching the one actually in this user's way.
  await reapTestSessions({ db, runner, limits }, { userId })

  const prepared = await prepareWorkflow({
    db,
    workflow,
    organizationId: input.organizationId,
    projectId,
    ...(input.nodeRegistry && { nodeRegistry: input.nodeRegistry }),
  })
  if (isPrepareError(prepared)) {
    return {
      ok: false,
      status: prepared.status,
      error: prepared.error,
      ...(prepared.details !== undefined && { details: prepared.details }),
    }
  }

  const id = nanoid()
  const reserved = await db.reserveTestSession(
    {
      id,
      workflowId: workflow.id,
      versionId: prepared.versionId,
      userId,
      runtime: runner.runtime,
      containerId: runner.containerId(id),
      files: buildFileManifest(prepared.projectFileRows),
    },
    {
      cutoffs: testSessionCutoffs(limits),
      projectId,
      maxConcurrentPerUser: limits.maxConcurrentPerUser,
      maxConcurrentTotal: limits.maxConcurrentTotal,
      maxPerWindowPerProject: limits.maxPerWindowPerProject,
      quotaWindowStart: quotaWindowStart(limits),
    },
  )
  if (!reserved) {
    // The database refused it; usage only turns that into a message.
    const usage = await db.getTestSessionUsage(projectId, userId, quotaWindowStart(limits))
    const refusal = testSessionStartRefusal(usage, limits)
    return { ok: false, status: refusal.limit === 'disabled' ? 503 : 429, error: refusal.error }
  }

  const { vars, secrets } = prepared.envVars
    ? splitEnvVars(prepared.envVars)
    : { vars: {}, secrets: {} }

  let started: { processId: string; port: number }
  try {
    started = await runner.start(prepared.bundle, {
      sessionId: id,
      workflowId: workflow.id,
      workflowName: workflow.name,
      kind: prepared.ir.kind === 'script' ? 'script' : 'workflow',
      ir: prepared.ir,
      ...(prepared.dependencies && { dependencies: prepared.dependencies }),
      ...(Object.keys(vars).length > 0 && { vars }),
      ...(Object.keys(secrets).length > 0 && { secrets }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start the test session'
    await stopTestSession({ db, runner, limits }, reserved, 'failed', { error: message })
    // The workflow refused (its imports reach outside it) is the caller's to
    // fix; anything else is the runner failing.
    return { ok: false, status: err instanceof GenerateInputError ? 422 : 502, error: message }
  }

  const session = await db.activateTestSession(
    id,
    userId,
    started.processId,
    started.port,
    testSessionCutoffs(limits),
  )
  if (!session) {
    // Something ended the reservation while the worker was coming up. It
    // matters which: a user who pressed Stop, or deleted the workflow,
    // should not be told their session was slow.
    const current = await db.getOwnedTestSession(id, userId, projectId, testSessionCutoffs(limits))
    const stoppedMeanwhile = current?.session.status === 'stopped'
    const reason = stoppedMeanwhile
      ? (current?.session.error ?? 'Test session was stopped while starting')
      : 'Test session took too long to start'

    await stopTestSession({ db, runner, limits }, { ...reserved, ...started }, 'failed', {
      error: reason,
    })
    return { ok: false, status: stoppedMeanwhile ? 409 : 504, error: reason }
  }

  return { ok: true, session }
}

/**
 * Writes off node sessions left behind by a previous run of this host.
 *
 * Their process ids and ports describe a process that is gone, and in a
 * container those numbers start again from the beginning — so the reaper
 * acting on them later would signal whatever holds them now. The workers
 * themselves died with the host; only the records need settling.
 */
export async function abandonStaleNodeSessions(db: DatabaseAdapter): Promise<number> {
  const abandoned = await db.markTestSessionRuntimeAbandoned(
    'node',
    'Stopped because the API restarted',
  )
  return abandoned.length
}

/**
 * Reaps on an interval, the way run sync does. Self-hosting runs one of
 * these; the Workers deployment reaps from its cron instead, since nothing
 * there survives between requests.
 */
export function startTestSessionReaper(deps: TestSessionDeps, intervalMs: number): () => void {
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    reapTestSessions(deps)
      .catch(() => {
        // A failed tick is not worth crashing the host over; the next one
        // sees the same expired sessions.
      })
      .finally(() => {
        running = false
      })
  }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
  return () => clearInterval(timer)
}

export type ResolveTestSessionResult =
  | { ok: true; session: TestSession; workflow: Workflow }
  | { ok: false; status: number; error: string }

/**
 * Loads a live session for its owner, stopping it first if it has expired —
 * a request that arrives after the cut-off is the earliest the system knows,
 * and it should not be served by a worker that is no longer accounted for.
 * With `workspaceId` (a workspace key's pin, or a workspace the request
 * names) a session elsewhere in the project is not found.
 */
export async function resolveTestSession(
  deps: TestSessionDeps,
  id: string,
  userId: string,
  projectId: string,
  workspaceId?: string,
): Promise<ResolveTestSessionResult> {
  const found = await deps.db.getOwnedTestSession(
    id,
    userId,
    projectId,
    testSessionCutoffs(deps.limits),
    workspaceId,
  )
  if (!found) return { ok: false, status: 404, error: 'Not found' }

  const { session, workflow, expiry } = found
  if (session.status === 'stopped' || session.status === 'failed') {
    return { ok: false, status: 410, error: session.error ?? 'Test session has stopped' }
  }
  if (expiry) {
    await stopTestSession(deps, session, 'stopped', { error: expiryMessage(expiry) })
    return { ok: false, status: 410, error: expiryMessage(expiry) }
  }
  if (session.status === 'starting') {
    return { ok: false, status: 409, error: 'Test session is still starting' }
  }
  return { ok: true, session, workflow }
}
