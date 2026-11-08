import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { CloudflareAPI, sanitizedWorkflowName } from '@awaitstep/provider-cloudflare'
import type { AppEnv } from '../types.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { zValidator } from '../lib/validation.js'
import { coalescedMembers, parseStepManifest } from '../lib/step-manifest.js'
import { syncRunById } from '../lib/run-sync.js'
import { diffRunDetail } from '../lib/run-events.js'
import type { WorkflowRunDetail } from '@awaitstep/codegen'
import { runPageRecord } from '../lib/run-records.js'

export const runs = new Hono<AppEnv>()

runs.get('/:workflowId/runs', zValidator('query', paginationQuerySchema), async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const { cursor, limit } = c.req.valid('query')
  const result = await db.listRunsByWorkflow(workflow.id, { cursor, limit })
  return c.json(runPageRecord(result))
})

// Pure DB read — the background run-sync loop (lib/run-sync.ts) reconciles
// status and per-step telemetry from the provider; requests never block on
// provider round-trips.
runs.get('/:workflowId/runs/:runId', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getWorkflowRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  return c.json(run)
})

/**
 * Per-step telemetry for a run, synced by the background loop. Ownership is
 * enforced inside the query (steps JOIN runs filtered by workflowId), so an
 * unknown or foreign run reads as an empty list. `coalescedInto` maps each
 * node whose code ran inside a merged step to that step's leader node, from
 * the deploy manifest — the provider reports one record per merged step,
 * and the UI needs the linkage to show members as executed.
 */
runs.get('/:workflowId/runs/:runId/steps', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const { steps, configSnapshot } = await db.listRunSteps(c.req.param('runId'), workflow.id)
  return c.json({
    data: steps,
    coalescedInto: coalescedMembers(parseStepManifest(configSnapshot)),
  })
})

const STREAM_TICK_MS = 2_000
const STREAM_MAX_MS = 10 * 60_000
const TERMINAL_RUN_STATUSES = new Set(['complete', 'errored', 'terminated'])

/**
 * Live run events as SSE. Each tick reconciles the run through the provider
 * (writing through to the DB, so the stream and the 5s background loop
 * share one truth) and pushes only what changed: `run` for status moves,
 * `step` per step whose status/attempts moved, `done` when terminal. The
 * stream closes after STREAM_MAX_MS so a forgotten tab cannot hold a
 * reconciliation loop forever; clients keep their polling as the floor and
 * simply reconnect. Cloudflare's subscribe endpoint is the intended source
 * once its REST shape is verified against a live account — this tick loop is
 * the provider-agnostic fallback it will slot in front of.
 */
runs.get('/:workflowId/runs/:runId/stream', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const runId = c.req.param('runId')

  const run = await db.getWorkflowRunById(runId)
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)

  return streamSSE(c, async (stream) => {
    let open = true
    stream.onAbort(() => {
      open = false
    })
    const startedAt = Date.now()
    let previous: WorkflowRunDetail | null = null
    let eventId = 0
    const send = (event: string, data: unknown) =>
      stream.writeSSE({ id: String(eventId++), event, data: JSON.stringify(data) })

    while (open && Date.now() - startedAt < STREAM_MAX_MS) {
      let detail: WorkflowRunDetail | null
      try {
        detail = await syncRunById(db, runId, workflow.id, { emails: c.get('emails') })
      } catch (err) {
        await send('error', { message: err instanceof Error ? err.message : String(err) })
        return
      }
      if (!detail) {
        // No connection to reach the provider through — nothing will ever
        // change on this stream.
        await send('done', {})
        return
      }
      for (const event of diffRunDetail(previous, detail)) {
        await send(event.event, event.data)
      }
      previous = detail
      if (TERMINAL_RUN_STATUSES.has(detail.status)) {
        await send('done', {})
        return
      }
      await stream.sleep(STREAM_TICK_MS)
    }
    if (open) await send('timeout', {})
  })
})

runs.post('/:workflowId/runs/:runId/pause', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getWorkflowRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  if (!run.connectionId || !run.instanceId) return c.json({ error: 'No connection' }, 400)

  const connection = await db.getProviderConnectionById(run.connectionId)
  if (!connection || connection.organizationId !== organizationId)
    return c.json({ error: 'Connection not found' }, 404)

  const pauseCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const cfApi = new CloudflareAPI(pauseCreds)
  await cfApi.pauseInstance(sanitizedWorkflowName(workflow.name), run.instanceId)
  await db.updateRun(run.id, { status: 'paused' })
  return c.json({ ok: true })
})

runs.post('/:workflowId/runs/:runId/resume', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getWorkflowRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  if (!run.connectionId || !run.instanceId) return c.json({ error: 'No connection' }, 400)

  const connection = await db.getProviderConnectionById(run.connectionId)
  if (!connection || connection.organizationId !== organizationId)
    return c.json({ error: 'Connection not found' }, 404)

  const resumeCreds = JSON.parse(connection.credentials) as { accountId: string; apiToken: string }
  const cfApi = new CloudflareAPI(resumeCreds)
  await cfApi.resumeInstance(sanitizedWorkflowName(workflow.name), run.instanceId)
  await db.updateRun(run.id, { status: 'running' })
  return c.json({ ok: true })
})

runs.post('/:workflowId/runs/:runId/terminate', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const run = await db.getWorkflowRunById(c.req.param('runId'))
  if (!run || run.workflowId !== workflow.id) return c.json({ error: 'Run not found' }, 404)
  if (!run.connectionId || !run.instanceId) return c.json({ error: 'No connection' }, 400)

  const connection = await db.getProviderConnectionById(run.connectionId)
  if (!connection || connection.organizationId !== organizationId)
    return c.json({ error: 'Connection not found' }, 404)

  const terminateCreds = JSON.parse(connection.credentials) as {
    accountId: string
    apiToken: string
  }
  const cfApi = new CloudflareAPI(terminateCreds)
  await cfApi.terminateInstance(sanitizedWorkflowName(workflow.name), run.instanceId)
  await db.updateRun(run.id, { status: 'terminated' })
  return c.json({ ok: true })
})
