import { readSessionManifest } from '../lib/test-session-manifest.js'
import { graphHash } from '../lib/graph-hash.js'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import type { Context } from 'hono'
import {
  BAD_EVENT_TYPE,
  BAD_INSTANCE_ID,
  TestSessionRefusal,
  isEventType,
  isInstanceId,
  type StartedTestSessionHandle,
  type TestSessionResponse,
  type TestSessionRunner,
} from '@awaitstep/codegen'
import type { TestSession } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import { followTestSession } from '../lib/test-session-stream.js'
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

const payloadSchema = z
  .unknown()
  .optional()
  .refine((value) => value === undefined || JSON.stringify(value).length <= MAX_PAYLOAD_BYTES, {
    message: `Payload must be under ${MAX_PAYLOAD_BYTES / 1024} KB`,
  })

const triggerSchema = z.object({ payload: payloadSchema })

const instanceParamSchema = z.object({
  sessionId: z.string(),
  instanceId: z.string().refine(isInstanceId, { message: BAD_INSTANCE_ID }),
})

const sendEventSchema = z.object({
  type: z.string().refine(isEventType, { message: BAD_EVENT_TYPE }),
  payload: payloadSchema,
})

const streamQuerySchema = z.object({
  after: z.string().max(64).optional(),
  instanceId: z.string().refine(isInstanceId, { message: BAD_INSTANCE_ID }).optional(),
})

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
function serialize(session: TestSession, runner: TestSessionRunner) {
  const built = readSessionManifest(session.files)
  return {
    id: session.id,
    workflowId: session.workflowId,
    versionId: session.versionId,
    runtime: session.runtime,
    status: session.status,
    error: session.error,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    files: built.files,
    graphHash: built.graphHash,
    /** What the runner can show and do for one instance, beyond status and send-event. */
    capabilities: {
      steps: typeof runner.instanceSteps === 'function',
      terminate: typeof runner.terminate === 'function',
    },
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

  // A live session is handed back rather than refused (the cap would turn a
  // second click into an error about the very session asked for), but only
  // when it runs the code that would be built now; startTestSession decides.
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
  if (result.reused) {
    return c.json({ session: serialize(result.session, context.runner), reused: true })
  }
  return c.json({ session: serialize(result.session, context.runner), reused: false }, 201)
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
  return c.json({ session: session ? serialize(session, context.runner) : null })
})

/**
 * A runner call that threw. A refusal (a limit, a session that is no longer
 * the runner's) is said as the runner put it; anything else is the runner
 * failing.
 */
async function runnerFailure(
  c: Context<AppEnv>,
  context: TestSessionDeps,
  session: TestSession,
  err: unknown,
) {
  if (err instanceof TestSessionRefusal) {
    if (err.retryAfterSeconds !== undefined) {
      c.header('Retry-After', String(Math.max(1, Math.ceil(err.retryAfterSeconds))))
    }
    // The runner no longer has it: the record says so too, or the next
    // start would hand this session back as live.
    if (err.status === 410) {
      await stopTestSession(context, session, 'stopped', { error: err.message })
    }
    return c.json({ error: err.message }, err.status as 429)
  }
  const message = err instanceof Error ? err.message : 'Could not reach the test session'
  return c.json({ error: message }, 502)
}

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
      c.get('workspaceId'),
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
      return runnerFailure(c, context, session, err)
    }
  },
)

// ── Stream ─────────────────────────────────────────────

/** Logs, and one instance's status and steps when the client names it (`followTestSession`). */
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
      c.get('workspaceId'),
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
      let eventId = 0
      await followTestSession({
        deps: context,
        session,
        userId,
        handle,
        ...(after !== undefined && { after }),
        ...(instanceId !== undefined && { instanceId }),
        send: (event, data) =>
          stream.writeSSE({ id: String(eventId++), event, data: JSON.stringify(data) }),
        isOpen: () => open,
      })
    })
  },
)

// ── One instance: send an event, terminate ─────────────

/** Whether the version a session runs has a Wait for Event step to send to. */
/**
 * Whether the session's build has a Wait for Event step to send to. The
 * version's graph is the build's only while it is the graph the session was
 * built from: a save onto an undeployed version keeps the id.
 */
async function waitsForEvents(
  context: TestSessionDeps,
  session: TestSession,
): Promise<'yes' | 'no' | 'behind'> {
  if (!session.versionId) return 'no'
  const version = await context.db.getWorkflowVersionById(session.versionId)
  if (!version) return 'no'
  let waits: boolean
  try {
    const ir = JSON.parse(version.ir) as { nodes?: { type?: unknown }[] }
    waits = (ir.nodes ?? []).some((node) => node.type === 'wait_for_event')
  } catch {
    return 'no'
  }
  if (!waits) return 'no'
  const builtFrom = readSessionManifest(session.files).graphHash
  return builtFrom === null || builtFrom === graphHash(version.ir) ? 'yes' : 'behind'
}

const NO_SUCH_INSTANCE = 'No such instance in this test session'

/** The runner's answer for one instance: its 404 is ours to say, the rest passes through. */
function instanceAnswer(c: Context<AppEnv>, response: TestSessionResponse) {
  if (response.status === 404) return c.json({ error: NO_SUCH_INSTANCE }, 404)
  return c.json({ status: response.status, body: response.body })
}

testSessions.post(
  '/test-sessions/:sessionId/instances/:instanceId/events',
  zValidator('param', instanceParamSchema),
  zValidator('json', sendEventSchema),
  async (c) => {
    const context = deps(c)
    if (!context) return c.json({ error: 'Test sessions are not available here' }, 501)

    const { sessionId, instanceId } = c.req.valid('param')
    const resolved = await resolveTestSession(
      context,
      sessionId,
      c.get('userId'),
      c.get('projectId'),
      c.get('workspaceId'),
    )
    if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status as 404)

    const { session } = resolved
    const [waits] = await Promise.all([
      waitsForEvents(context, session),
      context.db.touchTestSession(session.id, c.get('userId'), testSessionCutoffs(context.limits)),
    ])
    // Without a wait the self-hosted worker has no send-event route, and the
    // request would start a new run instead.
    if (waits === 'no') {
      return c.json({ error: 'This workflow has no Wait for Event step to send an event to' }, 400)
    }
    if (waits === 'behind') {
      return c.json(
        { error: 'The graph changed since this session started. Restart it to send events.' },
        409,
      )
    }

    const { type, payload } = c.req.valid('json')
    try {
      const response = await context.runner.sendEvent(
        sessionHandle(session) as StartedTestSessionHandle,
        instanceId,
        type,
        payload ?? {},
      )
      return instanceAnswer(c, response)
    } catch (err) {
      return runnerFailure(c, context, session, err)
    }
  },
)

testSessions.post(
  '/test-sessions/:sessionId/instances/:instanceId/terminate',
  zValidator('param', instanceParamSchema),
  async (c) => {
    const context = deps(c)
    if (!context) return c.json({ error: 'Test sessions are not available here' }, 501)
    const terminate = context.runner.terminate?.bind(context.runner)
    if (!terminate) {
      return c.json(
        { error: 'This test runner cannot end one instance. Stop ends the whole session.' },
        501,
      )
    }

    const { sessionId, instanceId } = c.req.valid('param')
    const resolved = await resolveTestSession(
      context,
      sessionId,
      c.get('userId'),
      c.get('projectId'),
      c.get('workspaceId'),
    )
    if (!resolved.ok) return c.json({ error: resolved.error }, resolved.status as 404)

    const { session } = resolved
    await context.db.touchTestSession(
      session.id,
      c.get('userId'),
      testSessionCutoffs(context.limits),
    )
    try {
      const response = await terminate(
        sessionHandle(session) as StartedTestSessionHandle,
        instanceId,
      )
      return instanceAnswer(c, response)
    } catch (err) {
      return runnerFailure(c, context, session, err)
    }
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
    c.get('workspaceId'),
    // Someone who can no longer edit there may still end what they started.
    { toStop: true },
  )
  if (!found) return c.json({ error: 'Not found' }, 404)

  // stopTestSession declines a session that already finished — its process
  // id and port belong to something else by now.
  await stopTestSession(context, found.session, 'stopped', { userId })
  return c.json({ status: 'stopped' })
})
