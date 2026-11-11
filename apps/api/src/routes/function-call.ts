import { Hono, type Context } from 'hono'
import { nanoid } from 'nanoid'
import type { FunctionCallResponse, FunctionCallResult } from '@awaitstep/codegen'
import type { Workflow } from '@awaitstep/db'
import { z } from 'zod'
import { zValidator } from '../lib/validation.js'
import { resolveProvider } from '../lib/provider-resolver.js'
import type { AppEnv } from '../types.js'
import { tellRunFailed } from '../lib/run-failure.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('function-call')

/** The body a call may carry, as text. */
const MAX_CALL_BODY_BYTES = 102_400 // 100 KB

const callSchema = z.object({
  connectionId: z.string().min(1),
  body: z
    .string()
    .refine((text) => new TextEncoder().encode(text).byteLength <= MAX_CALL_BODY_BYTES, {
      message: `The body must be under ${MAX_CALL_BODY_BYTES / 1024} KB`,
    }),
})

export const functionCall = new Hono<AppEnv>()

/**
 * Calls a deployed function (24i): POSTs the body to the URL it is live at
 * on that account and answers its status, time and body, with the run it was
 * recorded as. A call that couldn't be made (not live there, no URL) answers
 * 4xx and records nothing; one that failed — an answer that isn't 2xx, or none
 * at all — is recorded `errored` and tells the function's watchers. The
 * provider decides which URLs it will call from the server.
 */
functionCall.post('/:workflowId/call', zValidator('json', callSchema), async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  if (workflow.kind !== 'script') {
    return c.json({ error: 'Only a function can be called. Trigger a workflow instead.' }, 400)
  }
  const { connectionId, body } = c.req.valid('json')
  return callFunction(c, workflow, connectionId, async () => body)
})

/**
 * Calls `workflow` on `connectionId` and records it as a run. `readBody` runs
 * alongside the account read; null from it means the call to repeat isn't there.
 */
export async function callFunction(
  c: Context<AppEnv>,
  workflow: Workflow,
  connectionId: string,
  readBody: () => Promise<string | null>,
) {
  const db = c.get('db')
  const organizationId = c.get('organizationId')

  // Only an account the function is live on: what it answers there is this function.
  const [live, body] = await Promise.all([
    db.getLiveService(connectionId, organizationId, workflow.id),
    readBody(),
  ])
  if (body === null) return c.json({ error: 'Run not found' }, 404)
  if (!live) return c.json({ error: 'This function isn’t live on that account' }, 404)
  if (!live.serviceUrl) return c.json({ error: 'This deployment has no URL to call' }, 400)

  const adapter = resolveProvider(live.provider)
  if (!adapter.callFunction) {
    return c.json({ error: 'Calling a function isn’t available for this provider' }, 400)
  }
  const startedAt = Date.now()
  const result = await adapter.callFunction({ url: live.serviceUrl, body })
  if (!result.ok && result.kind === 'refused') return c.json({ error: result.reason }, 400)

  const durationMs = result.ok ? result.durationMs : Date.now() - startedAt
  const run = await db.createRun({
    id: nanoid(),
    workflowId: workflow.id,
    versionId: live.versionId,
    versionNumber: live.versionNumber,
    connectionId,
    // A call has no provider instance: our own id stands in.
    instanceId: `call_${nanoid(12)}`,
    trigger: c.get('apiKey') ? 'api' : 'dashboard',
    params: asParams(body),
    ...callOutcome(result),
    durationMs,
    createdAt: new Date(startedAt).toISOString(),
    updatedAt: new Date(startedAt + durationMs).toISOString(),
  })

  if (run.status === 'errored') {
    // Only on a failure: where the function lives, for the Inbox and the email.
    const target = await db.getRunForSyncWithAccount(run.id, workflow.id, organizationId)
    if (target) {
      await tellRunFailed(
        db,
        {
          place: target.entry.place,
          workflowId: workflow.id,
          workflowName: workflow.name,
          call: { errorMessage: failureMessage(run.error) },
        },
        null,
        c.get('emails'),
      ).catch((error: unknown) => {
        log.error('Couldn’t tell watchers of a failed call', {
          runId: run.id,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }
  }

  // No answer in time, or unreachable, is still an answer to show: its reason, not a 5xx.
  const answer: FunctionCallResponse = result.ok
    ? { ...result, runId: run.id }
    : { ok: false, reason: result.reason, runId: run.id }
  return c.json(answer)
}

/** The reply is kept up to this many characters, as a step's output is. */
const CALL_OUTPUT_LIMIT = 64 * 1024

/** How the call went, as the run records it. */
function callOutcome(result: FunctionCallResult) {
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
