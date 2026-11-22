import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode, ContentlessStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../types.js'
import { INSTANCE_ID_HEADER } from '@awaitstep/codegen'
import {
  callFunctionRun,
  MAX_RUN_PAYLOAD_BYTES,
  runStartDeps,
  startWorkflowRun,
  type CallAnswer,
} from '../lib/run-start.js'

/** The header that names the run a call, or a run through the workflow's own URL, was recorded as. */
export const RUN_ID_HEADER = 'X-AwaitStep-Run-Id'
/** Set when the function's answer was longer than is read back: the body is its start. */
export const TRUNCATED_HEADER = 'X-AwaitStep-Body-Truncated'
/**
 * Where a function's redirect points. Never sent as `Location`: from the API's
 * own origin a relative one (`/api/run/<other>`) would send a client that
 * follows redirects — with its key and, on a 307, its body — anywhere in the API.
 */
export const FUNCTION_LOCATION_HEADER = 'X-AwaitStep-Function-Location'

const TOO_LARGE = `The body must be under ${MAX_RUN_PAYLOAD_BYTES / 1024} KB`

export const externalRun = new Hono<AppEnv>()

/**
 * How other systems run a workflow or call a function (D-1): an API key with
 * `workflows:run`, the body as the run's payload. `?account=` names the
 * account to run on; without it, the one its newest live deploy went out on.
 *
 * A function, and a workflow whose deploy has a URL of its own (a route or
 * custom domain), get the request as sent and answer with their own status,
 * `Content-Type` and body bytes, the run in `X-AwaitStep-Run-Id` (a
 * redirect's target too, never as `Location`); a workflow run that started
 * also names its instance in `X-AwaitStep-Instance-Id`. A workflow without a
 * URL starts through the provider's API and answers
 * `201 { runId, instanceId, status }`, or `{ ok: true }` for the built-in
 * send-event body. The body's `instanceId` names the run's instance.
 */
externalRun.post('/:workflowId', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const connectionId = c.req.query('account') || null
  // Bytes, as sent: a function may take any body, not only text.
  const raw = new Uint8Array(await c.req.arrayBuffer())
  if (raw.byteLength > MAX_RUN_PAYLOAD_BYTES) return c.json({ error: TOO_LARGE }, 400)
  const deps = runStartDeps(c)
  const contentType = mediaType(c.req.header('content-type'))
  if (contentType === null) return c.json({ error: BAD_CONTENT_TYPE }, 400)

  if (workflow.kind === 'script') {
    const called = await callFunctionRun(deps, { workflow, connectionId }, async () => ({
      body: raw,
      ...(contentType && { contentType }),
    }))
    if (!called.ok) return c.json({ error: called.error }, called.status)
    return functionAnswer(c, called.answer, called.run.id)
  }

  const started = await startWorkflowRun(deps, { workflow, connectionId }, async () => ({
    ...readParams(raw),
    body: raw,
    ...(contentType && { contentType }),
    query: queryWithoutAccount(c.req.url),
  }))
  if (!started.ok) return c.json({ error: started.error }, started.status)
  if (started.outcome === 'event-sent') return c.json({ ok: true })
  const { run, answer } = started
  // Through the workflow's own URL: its handler's answer, the run in headers.
  if (answer) {
    if (started.outcome === 'started') c.header(INSTANCE_ID_HEADER, run.instanceId)
    return functionAnswer(c, answer, run.id)
  }
  return c.json({ runId: run.id, instanceId: run.instanceId, status: run.status }, 201)
})

const BAD_CONTENT_TYPE = 'Content-Type must be a media type, under 256 characters'
/** `type/subtype` with optional `; name=value` parameters. */
const MEDIA_TYPE =
  /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:\s*;\s*[\w!#$&^.+-]+=(?:[\w!#$&^.+-]+|"[^"\\\r\n]*"))*$/

/** The caller's Content-Type as it is passed on and kept; undefined for none, null for one that isn't a media type. */
function mediaType(header: string | undefined): string | undefined | null {
  const value = header?.trim()
  if (!value) return undefined
  return value.length < 256 && MEDIA_TYPE.test(value) ? value : null
}

/** The body as a run's params: JSON as sent, nothing for none, and a flag for a body that isn't JSON. */
function readParams(raw: Uint8Array): { params: unknown; notJson?: true } {
  const text = new TextDecoder().decode(raw)
  if (text.trim() === '') return { params: undefined }
  try {
    return { params: JSON.parse(text) as unknown }
  } catch {
    return { params: undefined, notJson: true }
  }
}

/** The caller's query string, without `account` (AwaitStep's own: which account to run on). */
function queryWithoutAccount(url: string): string | undefined {
  const search = new URL(url).searchParams
  search.delete('account')
  const query = search.toString()
  return query === '' ? undefined : query
}

/** Statuses whose response carries no body. */
const NO_BODY = new Set([101, 103, 204, 205, 304])

/** The function's own answer as the caller's, or 504 when none came. */
function functionAnswer(c: Context<AppEnv>, answer: CallAnswer, runId: string): Response {
  c.header(RUN_ID_HEADER, runId)
  if (!answer.ok) return c.json({ error: answer.reason, runId }, 504)
  if (answer.contentType) c.header('content-type', answer.contentType)
  if (answer.truncated) c.header(TRUNCATED_HEADER, 'true')
  // The status stays a redirect; without `Location` no client follows it.
  if (answer.location) c.header(FUNCTION_LOCATION_HEADER, answer.location)
  // Served from the dashboard's origin: whatever type it names runs nothing there.
  c.header('Content-Security-Policy', "default-src 'none'; sandbox")
  if (NO_BODY.has(answer.status)) return c.body(null, answer.status as ContentlessStatusCode)
  // Whatever the function answered, byte for byte (fetch never hands back an informational status).
  return c.body(answer.bytes as Uint8Array<ArrayBuffer>, answer.status as ContentfulStatusCode)
}
