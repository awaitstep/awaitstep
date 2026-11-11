import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import type { FunctionCallResult } from '@awaitstep/codegen'
import type { DatabaseAdapter, RunTrigger, Workflow, WorkflowRun } from '@awaitstep/db'
import type { AppEmails, AppEnv } from '../types.js'
import type { AppNodeRegistry } from './node-registry.js'
import { resolveProvider } from './provider-resolver.js'
import { tellRunFailed } from './run-failure.js'
import { createLogger } from './logger.js'

const log = createLogger('run-start')

// Starting a workflow run and calling a function, once for every way in: the
// dashboard's trigger, call and Run again, and the API's `POST /run/:id`. The
// routes read the request and shape the answer; what is started, on which
// account, and how it is recorded is decided here.

/** The most a run's payload, or a call's body, may carry. */
export const MAX_RUN_PAYLOAD_BYTES = 102_400 // 100 KB

/** What starting a run needs of the request it came in on. */
export interface RunStartDeps {
  db: DatabaseAdapter
  organizationId: string
  /** How it was started: a key's call is `api`, a person's `dashboard`. */
  trigger: RunTrigger
  nodeRegistry?: AppNodeRegistry
  emails?: AppEmails
}

export function runStartDeps(c: Context<AppEnv>): RunStartDeps {
  return {
    db: c.get('db'),
    organizationId: c.get('organizationId'),
    trigger: c.get('apiKey') ? 'api' : 'dashboard',
    nodeRegistry: c.get('nodeRegistry'),
    emails: c.get('emails'),
  }
}

/** Why nothing was started; nothing was recorded either. */
export interface RunStartRefusal {
  ok: false
  /** 502: the provider wouldn't start it. */
  status: 400 | 404 | 502
  error: string
}

export interface RunTarget {
  workflow: Workflow
  /** The account to run on; null for the one its newest live deploy went out on. */
  connectionId: string | null
}

export const NOT_LIVE = 'This workflow isn’t deployed with that connection'
export const NOT_LIVE_ANYWHERE = 'This workflow isn’t live on any account'
export const FUNCTION_NOT_LIVE = 'This function isn’t live on that account'
export const FUNCTION_NOT_LIVE_ANYWHERE = 'This function isn’t live on any account'
export const RUN_NOT_FOUND = 'Run not found'

/**
 * Starts one run of a workflow and records it, with how it was started and its
 * payload. `readPayload` runs alongside the account reads; null from it means
 * the run to repeat isn't there.
 */
export async function startWorkflowRun(
  deps: RunStartDeps,
  target: RunTarget,
  readPayload: () => Promise<{ params: unknown } | null>,
): Promise<{ ok: true; run: WorkflowRun } | RunStartRefusal> {
  const { db, organizationId } = deps
  const { workflow } = target

  if (workflow.kind === 'script') {
    return {
      ok: false,
      status: 400,
      error: 'A function is called, not triggered: use POST /api/run/:id or Call',
    }
  }

  // Only a connection this workflow was deployed with: the Cloudflare workflow is
  // found by name, so any other account could hold another project's of that name.
  const [connection, payload] = await Promise.all([
    db.getConnectionDeployedWith(target.connectionId, organizationId, workflow.id),
    readPayload(),
  ])
  if (!payload) return { ok: false, status: 404, error: RUN_NOT_FOUND }
  if (!connection) {
    return {
      ok: false,
      status: 404,
      error: target.connectionId === null ? NOT_LIVE_ANYWHERE : NOT_LIVE,
    }
  }
  const connectionId = connection.id

  const adapter = resolveProvider(connection.provider, {
    templateResolver: deps.nodeRegistry?.templateResolver,
  })
  // Stored deployment config carries instance retention for created runs.
  // Invalid/stale/corrupt rows fall back to provider defaults (7-day
  // retention) — a bad row must never block triggering.
  let deploymentConfig: unknown
  if (connection.deploymentConfig) {
    try {
      const parsed = adapter.deploymentConfigSchema.safeParse(
        JSON.parse(connection.deploymentConfig),
      )
      if (parsed.success) deploymentConfig = parsed.data
    } catch {
      /* corrupt JSON — use defaults */
    }
  }
  // The name it was deployed under there, so a rename since doesn't lose it.
  const deployedName = connection.deployedName ?? workflow.name
  const triggerCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const config = {
    provider: connection.provider,
    credentials: triggerCreds,
    options: {
      workflowName: deployedName,
      ...(deploymentConfig !== undefined && { deploymentConfig }),
    },
  }

  let instanceId: string
  try {
    ;({ instanceId } = await adapter.trigger(workflow.id, payload.params, config))
  } catch (err) {
    // Its text names the account and paths: the log keeps it, the caller gets the gist.
    log.error(`Provider refused to start a run (workflow ${workflow.id})`, err)
    return {
      ok: false,
      status: 502,
      error: triggerFailure(adapter.capabilities?.label ?? adapter.name, err),
    }
  }

  const run = await db.createRun({
    id: nanoid(),
    workflowId: workflow.id,
    // What that account runs, not the latest save.
    versionId: connection.deployedVersionId,
    versionNumber: connection.deployedVersionNumber,
    connectionId,
    instanceId,
    // Found again under this name, whatever is deployed or renamed later.
    deployedName,
    trigger: deps.trigger,
    // Kept so the run page can show it and start the run again (already capped at 100 KB).
    params: payload.params === undefined ? null : JSON.stringify(payload.params),
    status: 'queued',
  })
  return { ok: true, run }
}

/** What a call sends: its body, as text or the bytes a caller sent, and its type (JSON when left out). */
export interface CallBody {
  body: string | Uint8Array
  contentType?: string
}

/** Why the provider didn't start the run, without its own text: "Cloudflare refused it (HTTP 404)". */
function triggerFailure(provider: string, err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number'
    ? `${provider} refused to start the run (HTTP ${status}). Nothing was recorded.`
    : `Couldn’t reach ${provider} to start the run. Nothing was recorded.`
}

/** The function's answer, or why none came; a URL the provider won't call is a refusal instead. */
export type CallAnswer = Exclude<FunctionCallResult, { kind: 'refused' }>

/**
 * Calls a deployed function (24i): POSTs the body to the URL it is live at on
 * that account and records the call as a run. A call that couldn't be made
 * (not live there, no URL) is refused and records nothing; one that failed —
 * an answer that isn't 2xx, or none at all — is recorded `errored` and tells
 * the function's watchers. The provider decides which URLs it will call from
 * the server. `readBody` runs alongside the account read; null from it means
 * the call to repeat isn't there.
 */
export async function callFunctionRun(
  deps: RunStartDeps,
  target: RunTarget,
  readBody: () => Promise<CallBody | null>,
): Promise<{ ok: true; run: WorkflowRun; answer: CallAnswer } | RunStartRefusal> {
  const { db, organizationId } = deps
  const { workflow } = target

  // Only an account the function is live on: what it answers there is this function.
  const [live, sent] = await Promise.all([
    db.getLiveService(target.connectionId, organizationId, workflow.id),
    readBody(),
  ])
  if (sent === null) return { ok: false, status: 404, error: RUN_NOT_FOUND }
  const { body, contentType } = sent
  if (!live) {
    return {
      ok: false,
      status: 404,
      error: target.connectionId === null ? FUNCTION_NOT_LIVE_ANYWHERE : FUNCTION_NOT_LIVE,
    }
  }
  if (!live.serviceUrl) {
    return { ok: false, status: 400, error: 'This deployment has no URL to call' }
  }

  const adapter = resolveProvider(live.provider)
  if (!adapter.callFunction) {
    return { ok: false, status: 400, error: 'Calling a function isn’t available for this provider' }
  }
  const startedAt = Date.now()
  const result = await adapter.callFunction({
    url: live.serviceUrl,
    body,
    ...(contentType && { contentType }),
  })
  if (!result.ok && result.kind === 'refused')
    return { ok: false, status: 400, error: result.reason }

  const durationMs = result.ok ? result.durationMs : Date.now() - startedAt
  const run = await db.createRun({
    id: nanoid(),
    workflowId: workflow.id,
    versionId: live.versionId,
    versionNumber: live.versionNumber,
    connectionId: live.connectionId,
    // A call has no provider instance: our own id stands in.
    instanceId: `call_${nanoid(12)}`,
    trigger: deps.trigger,
    // Kept as text: bytes that aren't UTF-8 read back with replacement characters.
    params: asParams(typeof body === 'string' ? body : new TextDecoder().decode(body)),
    // Kept so Run again sends it the same way; null is JSON (the dashboard sends JSON).
    contentType: contentType ?? null,
    ...callOutcome(result),
    durationMs,
    createdAt: new Date(startedAt).toISOString(),
    updatedAt: new Date(startedAt + durationMs).toISOString(),
  })

  if (run.status === 'errored') await tellCallFailed(deps, workflow, run)
  return { ok: true, run, answer: result }
}

/** Only on a failure: where the function lives, for the Inbox and the email. */
async function tellCallFailed(
  deps: RunStartDeps,
  workflow: Workflow,
  run: WorkflowRun,
): Promise<void> {
  const target = await deps.db.getRunForSyncWithAccount(run.id, workflow.id, deps.organizationId)
  if (!target) return
  await tellRunFailed(
    deps.db,
    {
      place: target.entry.place,
      workflowId: workflow.id,
      workflowName: workflow.name,
      call: { errorMessage: failureMessage(run.error) },
    },
    null,
    deps.emails,
  ).catch((error: unknown) => {
    log.error('Couldn’t tell watchers of a failed call', {
      runId: run.id,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

/** The reply is kept up to this many characters, as a step's output is. */
const CALL_OUTPUT_LIMIT = 64 * 1024

/** How the call went, as the run records it. */
function callOutcome(result: CallAnswer) {
  if (!result.ok) {
    return {
      status: 'errored' as const,
      responseStatus: null,
      output: null,
      error: JSON.stringify({ name: 'CallFailed', message: result.reason }),
    }
  }
  const ok = result.status >= 200 && result.status < 300
  const answered = `Answered ${result.status}${result.statusText ? ` ${result.statusText}` : ''}`
  return {
    status: ok ? 'complete' : 'errored',
    responseStatus: result.status,
    output: result.body === '' ? null : result.body.slice(0, CALL_OUTPUT_LIMIT),
    error: ok ? null : JSON.stringify({ name: 'HttpStatus', message: answered }),
  }
}

/** The recorded error's message, for the notice: "Answered 500", or why no answer came. */
function failureMessage(error: string | null): string {
  try {
    return (JSON.parse(error ?? '') as { message?: string }).message ?? 'The call failed'
  } catch {
    return 'The call failed'
  }
}

/** The body as the run's payload: JSON as sent, any other text kept as a JSON string. */
function asParams(body: string): string | null {
  if (body.trim() === '') return null
  try {
    JSON.parse(body)
    return body
  } catch {
    return JSON.stringify(body)
  }
}

/** A call's kept payload as the body to send again: JSON text as kept, a kept string as itself. */
export function callBody(params: string | null): string {
  if (params === null) return ''
  const value = JSON.parse(params) as unknown
  return typeof value === 'string' ? value : params
}
