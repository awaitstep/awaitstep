import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import type { StartedTestSessionHandle, TestSessionRunner } from '@awaitstep/codegen'
import type { TestSession } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import { zValidator } from '../lib/validation.js'
import { testSessionCutoffs, type TestSessionLimits } from '../lib/test-session-policy.js'
import {
  resolveTestSession,
  sessionHandle,
  startTestSession,
  stopTestSession,
  type TestSessionDeps,
} from '../lib/test-sessions.js'

const MAX_PAYLOAD_BYTES = 102_400 // 100 KB, as for a deployed trigger

const triggerSchema = z.object({
  payload: z
    .unknown()
    .optional()
    .refine((value) => value === undefined || JSON.stringify(value).length <= MAX_PAYLOAD_BYTES, {
      message: `Payload must be under ${MAX_PAYLOAD_BYTES / 1024} KB`,
    }),
})

const streamQuerySchema = z.object({
  after: z.string().max(64).optional(),
  instanceId: z.string().max(200).optional(),
})

/** How long one stream stays open before the client reconnects. */
const STREAM_MAX_MS = 5 * 60_000
const STREAM_TICK_MS = 1_000

/**
 * Routes addressed by workflow. Mounted once, under `/workflows`.
 *
 * Split from the session routes deliberately: one router mounted at both
 * prefixes also answered at `/workflows/test-sessions/...`, a path the scope
 * guards never named, so a read-only key could trigger and stop sessions
 * there.
 */
export const workflowTestSessions = new Hono<AppEnv>()

/** Routes addressed by session id. Mounted once, at the router root. */
export const testSessions = new Hono<AppEnv>()

/**
 * What a session looks like to a client: never the container id or the
 * process, which are ours to act on and meaningless to anyone else.
 */
function serialize(session: TestSession) {
  return {
    id: session.id,
    workflowId: session.workflowId,
    versionId: session.versionId,
    runtime: session.runtime,
    status: session.status,
    error: session.error,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
  }
}

function deps(c: {
  get: (key: 'db' | 'testSessionRunner' | 'testSessionLimits') => unknown
}): TestSessionDeps | null {
  const runner = c.get('testSessionRunner') as TestSessionRunner | undefined
  if (!runner) return null
  return {
    db: c.get('db') as TestSessionDeps['db'],
    runner,
    limits: c.get('testSessionLimits') as TestSessionLimits,
  }
}

// ── Start / re-attach ──────────────────────────────────

workflowTestSessions.post('/:workflowId/test-sessions', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const context = deps(c)
  if (!context) return c.json({ error: 'Test sessions are not available here' }, 501)

  const userId = c.get('userId')
  const projectId = c.get('projectId')

  // An existing session is reused rather than refused: the cap would turn a
  // second click into an error about the very session the user is asking
  // for. A session still starting counts — otherwise a second click builds
  // the bundle again and then collides with its own reservation.
  const existing = await context.db.getLiveTestSessionForWorkflow(
    workflow.id,
    userId,
    testSessionCutoffs(context.limits),
  )
  if (existing) {
    // Running the version the user is looking at is the whole point: after a
    // save, handing back a session on the old code would quietly test the
    // wrong thing.
    if (existing.versionId === workflow.currentVersionId) {
      // Reuse is use: without this the session handed back can expire a
      // moment later.
      await context.db.touchTestSession(existing.id, userId, testSessionCutoffs(context.limits))
      return c.json({ session: serialize(existing), reused: true })
    }
    await stopTestSession(context, existing, 'stopped', {
      error: 'Replaced by a newer version',
      userId,
    })
  }

  const result = await startTestSession({
    ...context,
    workflow,
    organizationId: c.get('organizationId'),
    projectId,
    userId,
    ...(c.get('nodeRegistry') && { nodeRegistry: c.get('nodeRegistry') }),
  })
  if (!result.ok) {
    return c.json(
      { error: result.error, ...(result.details !== undefined && { details: result.details }) },
      result.status as 400,
    )
  }
  return c.json({ session: serialize(result.session), reused: false }, 201)
})

workflowTestSessions.get('/:workflowId/test-sessions', async (c) => {
  const workflow = c.get('workflow')
  if (!workflow) return c.json({ error: 'Not found' }, 404)
  const context = deps(c)
  if (!context) return c.json({ session: null })

  const session = await context.db.getLiveTestSessionForWorkflow(
    workflow.id,
    c.get('userId'),
    testSessionCutoffs(context.limits),
  )
  return c.json({ session: session ? serialize(session) : null })
})

// ── Trigger ────────────────────────────────────────────

testSessions.post(
  '/test-sessions/:sessionId/trigger',
  zValidator('json', triggerSchema),
  async (c) => {
    const context = deps(c)
    if (!context) return c.json({ error: 'Test sessions are not available here' }, 501)

    const resolved = await resolveTestSession(
      context,
      c.req.param('sessionId'),
      c.get('userId'),
      c.get('projectId'),
    )
    if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status as 404)

    const { session } = resolved
    await context.db.touchTestSession(
      session.id,
      c.get('userId'),
      testSessionCutoffs(context.limits),
    )

    try {
      const response = await context.runner.trigger(
        sessionHandle(session) as StartedTestSessionHandle,
        c.req.valid('json').payload ?? {},
      )
      return c.json({ status: response.status, body: response.body })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reach the test session'
      return c.json({ error: message }, 502)
    }
  },
)

// ── Stream ─────────────────────────────────────────────

/**
 * Logs, and the status of one instance when the client names it. The session
 * is touched on every tick: a stream open is a session in use, and without
 * that an active run would be reaped mid-flight.
 */
testSessions.get(
  '/test-sessions/:sessionId/stream',
  zValidator('query', streamQuerySchema),
  async (c) => {
    const context = deps(c)
    if (!context) return c.json({ error: 'Test sessions are not available here' }, 501)

    const resolved = await resolveTestSession(
      context,
      c.req.param('sessionId'),
      c.get('userId'),
      c.get('projectId'),
    )
    if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status as 404)

    const { session } = resolved
    const { after, instanceId } = c.req.valid('query')
    const userId = c.get('userId')
    const handle = sessionHandle(session) as StartedTestSessionHandle

    return streamSSE(c, async (stream) => {
      let open = true
      stream.onAbort(() => {
        open = false
      })

      const startedAt = Date.now()
      let cursor = after
      let eventId = 0
      let lastStatus = ''
      let closed = false
      const send = (event: string, data: unknown) =>
        stream.writeSSE({ id: String(eventId++), event, data: JSON.stringify(data) })

      while (open && Date.now() - startedAt < STREAM_MAX_MS) {
        const alive = await context.db.touchTestSession(
          session.id,
          userId,
          testSessionCutoffs(context.limits),
        )
        if (!alive) {
          closed = true
          await send('closed', { reason: 'Test session is no longer running' })
          break
        }

        try {
          const page = await context.runner.logs(handle, cursor)
          cursor = page.cursor
          if (page.entries.length > 0) await send('logs', { entries: page.entries, cursor })
        } catch {
          // A log read failing is not worth ending the stream over; the next
          // tick either recovers or the session stops being alive.
        }

        if (instanceId) {
          try {
            const status = await context.runner.instanceStatus(handle, instanceId)
            const serialized = JSON.stringify(status.body)
            if (serialized !== lastStatus) {
              lastStatus = serialized
              await send('instance', status.body)
            }
          } catch {
            // Same again: report what we can, keep the stream.
          }
        }

        await new Promise((resolve) => setTimeout(resolve, STREAM_TICK_MS))
      }

      // Only when the stream ran out of time. Saying "reconnect" after the
      // session died sends the client back for a 410.
      if (open && !closed) {
        await send('closed', { reason: 'Stream expired — reconnect to continue' })
      }
    })
  },
)

// ── Stop ───────────────────────────────────────────────

testSessions.delete('/test-sessions/:sessionId', async (c) => {
  const context = deps(c)
  if (!context) return c.json({ error: 'Test sessions are not available here' }, 501)

  const userId = c.get('userId')
  const found = await context.db.getOwnedTestSession(
    c.req.param('sessionId'),
    userId,
    c.get('projectId'),
    testSessionCutoffs(context.limits),
  )
  if (!found) return c.json({ error: 'Not found' }, 404)

  // stopTestSession declines a session that already finished — its process
  // id and port belong to something else by now.
  await stopTestSession(context, found.session, 'stopped', { userId })
  return c.json({ status: 'stopped' })
})
