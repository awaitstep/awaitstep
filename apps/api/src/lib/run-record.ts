import type { Context } from 'hono'
import { nanoid } from 'nanoid'
import type { FunctionCallResult, ProviderConfig, WorkflowProvider } from '@awaitstep/codegen'
import type {
  DatabaseAdapter,
  DeployedConnection,
  RunTrigger,
  Workflow,
  WorkflowRun,
} from '@awaitstep/db'
import type { AppEmails, AppEnv } from '../types.js'
import type { AppNodeRegistry } from './node-registry.js'
import { tellRunFailed } from './run-failure.js'
import { createLogger } from './logger.js'

const log = createLogger('run-record')

// What every way of starting a run or making a call shares: what it needs of
// the request, what it answers, and how a run or a call is recorded.

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
  /** The fetch for a deployment's own URL (the entry's: it refuses private addresses). */
  publicFetch?: typeof fetch
}

export function runStartDeps(c: Context<AppEnv>): RunStartDeps {
  return {
    db: c.get('db'),
    organizationId: c.get('organizationId'),
    trigger: c.get('apiKey') ? 'api' : 'dashboard',
    nodeRegistry: c.get('nodeRegistry'),
    emails: c.get('emails'),
    publicFetch: c.get('publicFetch'),
  }
}

/** Why nothing was started; nothing was recorded either. */
export interface RunStartRefusal {
  ok: false
  /** 409: a run under that instance id exists. 502: the provider wouldn't start it. */
  status: 400 | 404 | 409 | 502
  error: string
}

/**
 * What a run is started with: its params, and, when it came over HTTP, the
 * request as sent — passed on as is through the workflow's own URL.
 */
export interface RunPayload {
  /** The body read as JSON; undefined for none (or a body that isn't JSON). */
  params: unknown
  /** The caller's bytes; absent, `params` is sent as JSON. */
  body?: Uint8Array | string
  contentType?: string
  /** The caller's query string, without AwaitStep's own `account`. */
  query?: string
  /** The body isn't JSON: only the workflow's own handler can take it. */
  notJson?: boolean
}

/**
 * How a start went. `started`: a run was recorded on a new instance.
 * `answered`: the workflow's own handler answered and started nothing, so the
 * request is recorded as a call. `event-sent`: the built-in send-event body
 * reached its instance through the provider's API; nothing is recorded.
 * `answer` is the handler's own response, when the run went through its URL.
 */
export type RunStartOutcome =
  | { ok: true; outcome: 'started'; run: WorkflowRun; answer?: CallAnswer }
  | { ok: true; outcome: 'answered'; run: WorkflowRun; answer: CallAnswer }
  | { ok: true; outcome: 'event-sent' }
  | RunStartRefusal

/** Everything a start reads about where the workflow is live, once. */
export interface LiveWorkflow {
  deps: RunStartDeps
  workflow: Workflow
  connection: DeployedConnection
  adapter: WorkflowProvider
  /** What the provider calls the workflow there: runs are started under it. */
  deployedName: string
  config: ProviderConfig
  /** The deploy's own URL to run through, or null to run through the provider's API. */
  runUrl: string | null
}

/** The run, recorded on the instance it started, with how it was started and its payload. */
export function recordRun(
  live: LiveWorkflow,
  instanceId: string,
  payload: RunPayload,
): Promise<WorkflowRun> {
  return live.deps.db.createRun(runOnInstance(live, instanceId, payload))
}

/** A run on that instance, as it is recorded. */
export function runOnInstance(live: LiveWorkflow, instanceId: string, payload: RunPayload) {
  const { connection, deps, workflow } = live
  return {
    id: nanoid(),
    workflowId: workflow.id,
    // What that account runs, not the latest save.
    versionId: connection.deployedVersionId,
    versionNumber: connection.deployedVersionNumber,
    connectionId: connection.id,
    instanceId,
    // Found again under this name, whatever is deployed or renamed later.
    deployedName: live.deployedName,
    trigger: deps.trigger,
    // Kept so the run page can show it and start the run again (already capped at 100 KB).
    ...keptPayload(payload),
    status: 'queued' as const,
  }
}

/**
 * A payload as a run keeps it: JSON params, or — for a body sent with a type
 * other than JSON, or that isn't JSON — the body as text with its type, so Run
 * again sends it the same way.
 */
export function keptPayload(payload: RunPayload): {
  params: string | null
  contentType: string | null
} {
  const sentAs = payload.contentType?.split(';')[0]?.trim().toLowerCase()
  const asSent = payload.notJson || (sentAs !== undefined && sentAs !== 'application/json')
  if (asSent && payload.body !== undefined) {
    const text =
      typeof payload.body === 'string' ? payload.body : new TextDecoder().decode(payload.body)
    return { params: asParams(text), contentType: payload.contentType ?? null }
  }
  return {
    params: payload.params === undefined ? null : JSON.stringify(payload.params),
    contentType: null,
  }
}

/** What a call sends: its body, as text or the bytes a caller sent, and its type (JSON when left out). */
export interface CallBody {
  body: string | Uint8Array
  contentType?: string
}

/** The function's answer, or why none came; a URL the provider won't call is a refusal instead. */
export type CallAnswer = Exclude<FunctionCallResult, { kind: 'refused' }>

/** Where a call was made: the workflow and what is live on that account. */
export interface CallPlace {
  workflow: Workflow
  versionId: string | null
  versionNumber: number | null
  connectionId: string
  /** The provider's name for the workflow there; absent for a function. */
  deployedName?: string
}

/**
 * Records a call — a request answered with no provider instance behind it —
 * with its answer, and tells the watchers when it failed. Our own `call_` id
 * stands in for the instance.
 */
export async function recordCall(
  deps: RunStartDeps,
  place: CallPlace,
  kept: { params: string | null; contentType: string | null },
  answer: CallAnswer,
  startedAt: number,
): Promise<WorkflowRun> {
  const durationMs = answer.ok ? answer.durationMs : Date.now() - startedAt
  const run = await deps.db.createRun({
    id: nanoid(),
    workflowId: place.workflow.id,
    versionId: place.versionId,
    versionNumber: place.versionNumber,
    connectionId: place.connectionId,
    instanceId: `call_${nanoid(12)}`,
    ...(place.deployedName && { deployedName: place.deployedName }),
    trigger: deps.trigger,
    ...kept,
    ...callOutcome(answer),
    durationMs,
    createdAt: new Date(startedAt).toISOString(),
    updatedAt: new Date(startedAt + durationMs).toISOString(),
  })
  if (run.status === 'errored') await tellCallFailed(deps, place.workflow, run)
  return run
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
export function callOutcome(result: CallAnswer) {
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
export function asParams(body: string): string | null {
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
