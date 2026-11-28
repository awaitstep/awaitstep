import type { GeneratedBundle, LocalDevOptions, ProcessLogEntry } from './types.js'

/**
 * Where a test session's code actually runs. `'sandbox'` is a Cloudflare
 * container and `'node'` is a child process on the API host (self-host):
 * both run `wrangler dev`. `'managed'` is a runner an extension brings, which
 * runs the code the way its own deployments run and may have no container,
 * process or port at all. A test session never deploys, so none of them needs
 * provider credentials.
 */
export const TEST_SESSION_RUNTIMES = ['sandbox', 'node', 'managed'] as const
export type TestSessionRuntime = (typeof TEST_SESSION_RUNTIMES)[number]

/**
 * What to run, resolved by the API before the runner is called: everything
 * local dev needs plus the identity of the session it belongs to.
 */
export interface TestSessionTarget extends LocalDevOptions {
  /**
   * Identity of the session, chosen by the caller. The runner derives its
   * container/workspace name from it, so a later request can re-attach to a
   * running session from the stored handle alone.
   */
  sessionId: string
  /**
   * Whose session it is. A runner that keeps sessions of many organisations
   * apart, or allows one per workflow, needs to know; the container runners
   * do not read them.
   */
  organizationId?: string
  projectId?: string
  userId?: string
}

/**
 * Where to reach a session. A session is recorded before its worker exists,
 * so the process and port are absent until it has started — `stop` must cope
 * with that, which is how a half-started container still gets disposed. A
 * runner with no process or port never sets them.
 */
export interface TestSessionHandle {
  sessionId: string
  /**
   * The runner's own name for the session, as its `containerId()` gave it: a
   * container, a directory, or whatever else the runner finds a session by.
   * Nothing but the runner reads it.
   */
  containerId: string
  processId?: string | null
  port?: number | null
}

/** A handle to a worker that is actually up. */
export interface StartedTestSessionHandle extends TestSessionHandle {
  processId: string
  port: number
}

/** What a started worker reports back about itself; nothing, for a runner with no process or port. */
export interface TestSessionStart {
  processId?: string | null
  port?: number | null
}

/**
 * A runner turning a start or a trigger away for a reason that is the
 * caller's to act on: someone else holds the session, a limit is reached. The
 * API answers with `status` and the message as written, where any other error
 * from a runner reads as the runner failing.
 */
export class TestSessionRefusal extends Error {
  readonly status: number
  /** Seconds until asking again can succeed, when the runner knows. */
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, options?: { retryAfterSeconds?: number }) {
    super(message)
    this.name = 'TestSessionRefusal'
    this.status = status
    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds
    }
  }
}

/** A response proxied back from the session's worker. */
export interface TestSessionResponse {
  status: number
  body: unknown
}

/**
 * A page of worker output. The cursor is opaque, and deliberately not a
 * timestamp: a container reports its logs as whole stdout/stderr buffers
 * with no per-line clock, so "everything after what I last saw" is the only
 * question both runtimes can answer the same way. Each runner decides what
 * it has to remember to answer that — the container's has to track both
 * buffers, which no single number can do.
 */
export interface TestSessionLogPage {
  entries: ProcessLogEntry[]
  /** Pass back as `after` to continue from here. */
  cursor: string
}

/**
 * Runs a generated bundle somewhere disposable so a workflow can be executed
 * before it is deployed. Implementations are DB-free; the API owns session
 * records, quotas and TTL.
 */
export interface TestSessionRunner {
  readonly runtime: TestSessionRuntime

  /**
   * The provider a session's code is prepared for, when the runner runs one
   * provider's deployments: the workflow is then checked and generated as a
   * deploy to it would be. Without it the workflow's own provider is used.
   */
  readonly provider?: string

  /**
   * `false` when a live session holds nothing from a shared, fixed pool (no
   * container stays up for it): the cap on live sessions everyone holds
   * together, which protects that pool, is then not applied. A runner that
   * does not say is taken to hold one.
   */
  readonly pooled?: boolean

  /**
   * `true` when `start` itself ends the session the workflow had (and may
   * use what that one built). The caller's session running older code is
   * then only recorded as stopped before the new one starts, and `stop` is
   * not called for it.
   */
  readonly replaces?: boolean

  /**
   * The runner's name for a session id: a container, a workspace, or any
   * handle of its own. The API stores this when it records the session, so
   * the reaper can dispose a session whose start never reported back.
   */
  containerId(sessionId: string): string

  /**
   * Makes the session ready to take a trigger: for a container runner,
   * scaffolds the workspace, installs dependencies and starts the worker.
   * May throw a `TestSessionRefusal`.
   */
  start(bundle: GeneratedBundle, target: TestSessionTarget): Promise<TestSessionStart>

  /**
   * Runs the session's code with a JSON payload: its `fetch` handler, or
   * whatever a trigger of the deployed workflow would start. May throw a
   * `TestSessionRefusal`.
   */
  trigger(handle: StartedTestSessionHandle, payload: unknown): Promise<TestSessionResponse>

  /** Reads one workflow instance's status out of the running session. */
  instanceStatus(handle: StartedTestSessionHandle, instanceId: string): Promise<TestSessionResponse>

  /** Worker output after the given cursor, oldest first. */
  logs(handle: StartedTestSessionHandle, after?: string): Promise<TestSessionLogPage>

  /**
   * Stops the worker and disposes the container/workspace. Idempotent, and
   * safe for a session that never finished starting.
   */
  stop(handle: TestSessionHandle): Promise<void>
}
