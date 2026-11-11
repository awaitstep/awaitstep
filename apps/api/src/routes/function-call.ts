import { Hono, type Context } from 'hono'
import type { FunctionCallResponse } from '@awaitstep/codegen'
import type { Workflow } from '@awaitstep/db'
import { z } from 'zod'
import { zValidator } from '../lib/validation.js'
import type { AppEnv } from '../types.js'
import {
  callFunctionRun,
  MAX_RUN_PAYLOAD_BYTES,
  runStartDeps,
  type CallBody,
} from '../lib/run-start.js'

const callSchema = z.object({
  connectionId: z.string().min(1),
  body: z
    .string()
    .refine((text) => new TextEncoder().encode(text).byteLength <= MAX_RUN_PAYLOAD_BYTES, {
      message: `The body must be under ${MAX_RUN_PAYLOAD_BYTES / 1024} KB`,
    }),
})

export const functionCall = new Hono<AppEnv>()

/**
 * Calls a deployed function (24i) on that account and answers its status,
 * time and body, with the run it was recorded as; how the call is made and
 * recorded is `callFunctionRun`'s.
 */
functionCall.post('/:workflowId/call', zValidator('json', callSchema), async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  if (workflow.kind !== 'script') {
    return c.json({ error: 'Only a function can be called. Trigger a workflow instead.' }, 400)
  }
  const { connectionId, body } = c.req.valid('json')
  return callFunction(c, workflow, connectionId, async () => ({ body }))
})

/** Calls `workflow` on `connectionId` and answers as the dashboard reads it. */
export async function callFunction(
  c: Context<AppEnv>,
  workflow: Workflow,
  connectionId: string,
  readBody: () => Promise<CallBody | null>,
) {
  const called = await callFunctionRun(runStartDeps(c), { workflow, connectionId }, readBody)
  if (!called.ok) return c.json({ error: called.error }, called.status)
  const { answer, run } = called
  // No answer in time, or unreachable, is still an answer to show: its reason, not a 5xx.
  let body: FunctionCallResponse
  if (answer.ok) {
    // The text is what the dialog shows; the bytes are for /run's passthrough.
    const { bytes: _bytes, location: _location, ...shown } = answer
    body = { ...shown, runId: run.id }
  } else {
    body = { ok: false, reason: answer.reason, runId: run.id }
  }
  return c.json(body)
}
