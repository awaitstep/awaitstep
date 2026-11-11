import { Hono, type Context } from 'hono'
import type { ContentfulStatusCode, ContentlessStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../types.js'
import {
  callFunctionRun,
  MAX_RUN_PAYLOAD_BYTES,
  runStartDeps,
  startWorkflowRun,
  type CallAnswer,
} from '../lib/run-start.js'

/** The header that names the run a function call was recorded as. */
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
 * A workflow answers `201 { runId, instanceId, status }`; a function answers
 * with its own status, `Content-Type` and body bytes, the run in a header (a
 * redirect's target too, never as `Location`).
 */
externalRun.post('/:workflowId', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const connectionId = c.req.query('account') || null
  // Bytes, as sent: a function may take any body, not only text.
  const raw = new Uint8Array(await c.req.arrayBuffer())
  if (raw.byteLength > MAX_RUN_PAYLOAD_BYTES) return c.json({ error: TOO_LARGE }, 400)
  const deps = runStartDeps(c)

  if (workflow.kind === 'script') {
    const contentType = c.req.header('content-type')
    const called = await callFunctionRun(deps, { workflow, connectionId }, async () => ({
      body: raw,
      ...(contentType && { contentType }),
    }))
    if (!called.ok) return c.json({ error: called.error }, called.status)
    return functionAnswer(c, called.answer, called.run.id)
  }

  const body = new TextDecoder().decode(raw)
  let params: unknown
  if (body.trim() !== '') {
    try {
      params = JSON.parse(body) as unknown
    } catch {
      return c.json({ error: 'The body must be JSON: it is the run’s params' }, 400)
    }
  }
  const started = await startWorkflowRun(deps, { workflow, connectionId }, async () => ({
    params,
  }))
  if (!started.ok) return c.json({ error: started.error }, started.status)
  const { run } = started
  return c.json({ runId: run.id, instanceId: run.instanceId, status: run.status }, 201)
})

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
