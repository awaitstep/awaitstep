import { INSTANCE_ID_HEADER, namedInstanceId } from '@awaitstep/codegen'
import {
  keptPayload,
  recordCall,
  runOnInstance,
  type LiveWorkflow,
  type RunPayload,
  type RunStartOutcome,
} from './run-record.js'
import { freshInstanceId, withQuery } from './run-request.js'
import { createLogger } from './logger.js'

const log = createLogger('run-through-url')

/**
 * A run through the workflow's own URL, as callers reach it on Cloudflare: the
 * request goes on as sent, with the instance id AwaitStep names for the run
 * (the body's `instanceId`, else a new one) in `X-AwaitStep-Instance-Id`. The
 * generated entry hands it to the first `startWorkflow`, so whether a run
 * started is a question the provider answers afterwards: if that instance now
 * exists, and didn't before, a run is recorded on it; otherwise the request
 * is recorded as a call, with the handler's answer.
 */
export async function startThroughUrl(
  live: LiveWorkflow,
  url: string,
  payload: RunPayload,
): Promise<RunStartOutcome> {
  const { adapter, config, deps, workflow, connection } = live
  const named = namedInstanceId(payload.params)
  if (!named.ok) return { ok: false, status: 400, error: named.error }
  const instanceId = named.instanceId ?? freshInstanceId()

  // An id the caller named may already be a run (a send-event body names the
  // one it resumes): only an instance that wasn't there before is this run.
  const existedBefore = named.instanceId
    ? await exists(named.instanceId).then((found) => found !== false)
    : false

  const body = payload.body ?? (payload.params === undefined ? '' : JSON.stringify(payload.params))
  const startedAt = Date.now()
  const answer = await adapter.callFunction!(
    {
      url: withQuery(url, payload.query),
      body,
      ...(payload.contentType && { contentType: payload.contentType }),
      headers: { [INSTANCE_ID_HEADER]: instanceId },
    },
    deps.publicFetch,
  )
  // Never called: the provider wouldn't take the URL after all.
  if (!answer.ok && answer.kind === 'refused') {
    return { ok: false, status: 400, error: answer.reason }
  }

  // Asked even when no answer came: the handler may have started it first.
  // Recorded only if no run is on that instance yet: of two requests that
  // started it at once, one records the run and the other a call.
  if (!existedBefore && (await exists(instanceId)) === true) {
    const run = await deps.db.createRunForInstance(runOnInstance(live, instanceId, payload))
    if (run) return { ok: true, outcome: 'started', run, answer }
  }

  const run = await recordCall(
    deps,
    {
      workflow,
      versionId: connection.deployedVersionId,
      versionNumber: connection.deployedVersionNumber,
      connectionId: connection.id,
      deployedName: live.deployedName,
    },
    keptPayload(payload),
    answer,
    startedAt,
  )
  return { ok: true, outcome: 'answered', run, answer }

  async function exists(id: string): Promise<boolean | null> {
    try {
      return await adapter.hasInstance!(id, config)
    } catch (err) {
      // Unknown is never taken for a start: the request is recorded as a call.
      log.warn(`Couldn’t tell whether instance ${id} exists (workflow ${workflow.id})`, err)
      return null
    }
  }
}
