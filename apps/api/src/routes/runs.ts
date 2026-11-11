import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { resolveProvider } from '../lib/provider-resolver.js'
import type { AppEnv } from '../types.js'
import { paginationQuerySchema } from '../lib/pagination.js'
import { zValidator } from '../lib/validation.js'
import { coalescedMembers, parseStepManifest } from '../lib/step-manifest.js'
import { syncRunById } from '../lib/run-sync.js'
import { diffRunDetail } from '../lib/run-events.js'
import type { WorkflowProvider, WorkflowRunDetail } from '@awaitstep/codegen'
import { RunGoneError } from '@awaitstep/codegen'
import { runPageRecord, runStepExtrasRecord } from '../lib/run-records.js'

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

  // The workflow is checked in the read itself, and only the page's columns come back.
  const run = await db.getRunDetail(c.req.param('runId'), workflow.id)
  if (!run) return c.json({ error: 'Run not found' }, 404)
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

/** The payload a run was started with; `params` is null when it had none or wasn't kept. */
runs.get('/:workflowId/runs/:runId/params', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const row = await db.getRunParams(c.req.param('runId'), workflow.id)
  if (!row) return c.json({ error: 'Run not found' }, 404)
  return c.json({ params: row.params === null ? null : (JSON.parse(row.params) as unknown) })
})

/**
 * One step's output and tries, read when the step is selected so the list
 * stays small. The step must be that run's and the run that workflow's — one
 * statement checks both. A cut output can't be parsed, so it comes back as
 * `outputPreview` text with `outputTruncated: true` and `output: null`.
 */
runs.get('/:workflowId/runs/:runId/steps/:stepId', async (c) => {
  const db = c.get('db')
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)

  const extras = await db.getRunStepExtras(c.req.param('stepId'), c.req.param('runId'), workflow.id)
  if (!extras) return c.json({ error: 'Step not found' }, 404)
  return c.json(runStepExtrasRecord(extras))
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

  // Only that it is this workflow's run: the workflow is checked in the read.
  if (!(await db.getRunDetail(runId, workflow.id))) return c.json({ error: 'Run not found' }, 404)

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
        detail = await syncRunById(db, runId, workflow.id, c.get('organizationId'), {
          emails: c.get('emails'),
        })
      } catch (err) {
        await send('error', { message: err instanceof Error ? err.message : String(err) })
        return
      }
      if (!detail) {
        // No connection to reach the provider through, or the provider no
        // longer has the run — nothing will ever change on this stream.
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

/**
 * Pauses, resumes or terminates a run on its provider. Answers the gone error
 * when the provider no longer has it (so the route can say so instead of a
 * 500); anything else it throws, as before.
 */
async function controlOrGone(
  adapter: WorkflowProvider,
  action: 'pause' | 'resume' | 'terminate',
  input: Parameters<NonNullable<WorkflowProvider['controlRun']>>[1],
): Promise<RunGoneError | null> {
  try {
    await adapter.controlRun!(action, input)
    return null
  } catch (err) {
    if (err instanceof RunGoneError) return err
    throw err
  }
}

const CONTROLLED_STATUS = { pause: 'paused', resume: 'running', terminate: 'terminated' } as const

/**
 * Pause, resume or terminate a run on its provider, then record the status
 * that follows. The run, the name its workflow is known by there, and its
 * account (only when it is the organization's) come from one read.
 */
function controlRoute(action: keyof typeof CONTROLLED_STATUS) {
  return async (c: Context<AppEnv>) => {
    const db = c.get('db')
    const workflow = c.get('workflow')
    if (!workflow) return c.json({ error: 'Not found' }, 404)

    const target = await db.getRunControl(
      c.req.param('runId')!,
      workflow.id,
      c.get('organizationId'),
    )
    if (!target) return c.json({ error: 'Run not found' }, 404)
    if (!target.connectionId || !target.instanceId) return c.json({ error: 'No connection' }, 400)
    const { connection } = target
    if (!connection) return c.json({ error: 'Connection not found' }, 404)

    const adapter = resolveProvider(connection.provider)
    if (!adapter.controlRun) {
      return c.json({ error: `${adapter.name} does not support run control` }, 501)
    }
    const gone = await controlOrGone(adapter, action, {
      workflowName: target.deployedName ?? workflow.name,
      instanceId: target.instanceId,
      config: {
        provider: connection.provider,
        credentials: JSON.parse(connection.credentials) as Record<string, string>,
      },
    })
    // Gone from the provider: it can't be paused or resumed; a terminate stands, it has stopped.
    if (gone && action !== 'terminate') return c.json({ error: gone.message }, 409)
    await db.updateRun(target.runId, { status: CONTROLLED_STATUS[action] })
    return c.json({ ok: true })
  }
}

runs.post('/:workflowId/runs/:runId/pause', controlRoute('pause'))
runs.post('/:workflowId/runs/:runId/resume', controlRoute('resume'))
runs.post('/:workflowId/runs/:runId/terminate', controlRoute('terminate'))
