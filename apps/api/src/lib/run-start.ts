import {
  InstanceExistsError,
  RunGoneError,
  namedInstanceId,
  sendEventBody,
  type ProviderConfig,
  type WorkflowProvider,
} from '@awaitstep/codegen'
import type { DeployedConnection, Workflow, WorkflowRun } from '@awaitstep/db'
import { resolveProvider } from './provider-resolver.js'
import { createLogger } from './logger.js'
import {
  asParams,
  recordCall,
  recordRun,
  type CallAnswer,
  type CallBody,
  type LiveWorkflow,
  type RunPayload,
  type RunStartDeps,
  type RunStartOutcome,
  type RunStartRefusal,
} from './run-record.js'
import { startThroughUrl } from './run-through-url.js'

export {
  MAX_RUN_PAYLOAD_BYTES,
  callBody,
  runStartDeps,
  type CallAnswer,
  type CallBody,
  type RunPayload,
  type RunStartDeps,
  type RunStartOutcome,
  type RunStartRefusal,
} from './run-record.js'

const log = createLogger('run-start')

// Starting a workflow run and calling a function, once for every way in: the
// dashboard's trigger, call and Run again, and the API's `POST /run/:id`. The
// routes read the request and shape the answer; what is started, on which
// account, and how it is recorded is decided here.

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
export const NOT_JSON = 'The body must be JSON: it is the run’s params'
export const INSTANCE_NOT_FOUND = 'Instance not found'

/**
 * Starts one run of a workflow, or sends the built-in send-event body to one,
 * and records what happened. Through the workflow's own URL when its deploy
 * has one (the user's fetch handler decides), else directly through the
 * provider's API. `readPayload` runs alongside the account reads; null from
 * it means the run to repeat isn't there.
 */
export async function startWorkflowRun(
  deps: RunStartDeps,
  target: RunTarget,
  readPayload: () => Promise<RunPayload | null>,
): Promise<RunStartOutcome> {
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

  const live = liveWorkflow(deps, workflow, connection)
  return live.runUrl ? startThroughUrl(live, live.runUrl, payload) : startDirectly(live, payload)
}

function liveWorkflow(
  deps: RunStartDeps,
  workflow: Workflow,
  connection: DeployedConnection,
): LiveWorkflow {
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
  const credentials = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const config: ProviderConfig = {
    provider: connection.provider,
    credentials,
    options: {
      workflowName: deployedName,
      ...(deploymentConfig !== undefined && { deploymentConfig }),
    },
  }
  // Through the URL only when the provider can call it and tell afterwards
  // whether a run started there.
  const canRunThrough = Boolean(adapter.callFunction && adapter.hasInstance)
  const runUrl = canRunThrough
    ? urlToCall(adapter, connection.serviceUrl, connection.deploySettings)
    : null
  return { deps, workflow, connection, adapter, deployedName, config, runUrl }
}

/** No URL of its own: the body is read as the built-in route reads it, and the provider's API does the rest. */
async function startDirectly(live: LiveWorkflow, payload: RunPayload): Promise<RunStartOutcome> {
  const { adapter, workflow } = live
  if (payload.notJson) return { ok: false, status: 400, error: NOT_JSON }
  const label = adapter.capabilities?.label ?? adapter.name

  // Read as the worker's own route reads it: the body, or `?action=send-event`.
  const event = sendEventBody(
    payload.params,
    payload.query ? new URLSearchParams(payload.query) : undefined,
  )
  if (event) {
    if (!event.ok) return { ok: false, status: 400, error: event.error }
    if (!adapter.sendEvent) {
      return { ok: false, status: 400, error: `Sending events isn’t available for ${label}` }
    }
    try {
      await adapter.sendEvent({ ...event, config: live.config })
    } catch (err) {
      if (err instanceof RunGoneError) return { ok: false, status: 404, error: INSTANCE_NOT_FOUND }
      log.error(`Provider refused an event (workflow ${workflow.id})`, err)
      return { ok: false, status: 502, error: eventFailure(label, err) }
    }
    return { ok: true, outcome: 'event-sent' }
  }

  const named = namedInstanceId(payload.params)
  if (!named.ok) return { ok: false, status: 400, error: named.error }
  let instanceId: string
  try {
    ;({ instanceId } = await adapter.trigger(workflow.id, payload.params, live.config, {
      ...(named.instanceId && { instanceId: named.instanceId }),
    }))
  } catch (err) {
    if (err instanceof InstanceExistsError) return { ok: false, status: 409, error: err.message }
    // Its text names the account and paths: the log keeps it, the caller gets the gist.
    log.error(`Provider refused to start a run (workflow ${workflow.id})`, err)
    return { ok: false, status: 502, error: triggerFailure(label, err) }
  }
  return { ok: true, outcome: 'started', run: await recordRun(live, instanceId, payload) }
}

export const STALE_URL =
  'This deployment’s URL isn’t one its settings give: deploy it again to call it'

/** The deploy's URL as the provider judges it against the settings it went out with; null for none to call. */
function urlToCall(
  adapter: WorkflowProvider,
  recorded: string | null,
  deploySettings: string | null,
): string | null {
  if (!adapter.runUrl) return recorded && adapter.canCallUrl?.(recorded) ? recorded : null
  let settings: unknown
  try {
    settings = deploySettings ? (JSON.parse(deploySettings) as unknown) : undefined
  } catch {
    settings = undefined
  }
  return adapter.runUrl(recorded, settings)
}

/** Why the provider didn't start the run, without its own text: "Cloudflare refused it (HTTP 404)". */
function triggerFailure(provider: string, err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number'
    ? `${provider} refused to start the run (HTTP ${status}). Nothing was recorded.`
    : `Couldn’t reach ${provider} to start the run. Nothing was recorded.`
}

/** Why the provider didn't take the event, without its own text. */
function eventFailure(provider: string, err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number'
    ? `${provider} refused the event (HTTP ${status}).`
    : `Couldn’t reach ${provider} to send the event.`
}

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
  // A URL the provider won't call at all is its refusal to give (below).
  const url =
    adapter.canCallUrl?.(live.serviceUrl) === false
      ? live.serviceUrl
      : urlToCall(adapter, live.serviceUrl, live.deploySettings)
  if (!url) return { ok: false, status: 400, error: STALE_URL }
  const startedAt = Date.now()
  const result = await adapter.callFunction(
    { url, body, ...(contentType && { contentType }) },
    deps.publicFetch,
  )
  if (!result.ok && result.kind === 'refused')
    return { ok: false, status: 400, error: result.reason }

  const run = await recordCall(
    deps,
    {
      workflow,
      versionId: live.versionId,
      versionNumber: live.versionNumber,
      connectionId: live.connectionId,
    },
    {
      // Kept as text: bytes that aren't UTF-8 read back with replacement characters.
      params: asParams(typeof body === 'string' ? body : new TextDecoder().decode(body)),
      // Kept so Run again sends it the same way; null is JSON (the dashboard sends JSON).
      contentType: contentType ?? null,
    },
    result,
    startedAt,
  )
  return { ok: true, run, answer: result }
}
