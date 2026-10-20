import type { GeneratedBundle, LocalDevOptions, ProcessLogEntry } from './types.js'

/**
 * Where a test session's worker actually runs. `'sandbox'` is a Cloudflare
 * container (the cloud path); `'node'` is a child process on the API host
 * (self-host). Both run `wrangler dev` — a test session never deploys, so it
 * needs no provider credentials.
 */
export const TEST_SESSION_RUNTIMES = ['sandbox', 'node'] as const
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
}

/**
 * Where to reach a session. A session is recorded before its worker exists,
 * so the process and port are absent until it has started — `stop` must cope
 * with that, which is how a half-started container still gets disposed.
 */
export interface TestSessionHandle {
  sessionId: string
  containerId: string
  processId?: string | null
  port?: number | null
}

/** A handle to a worker that is actually up. */
export interface StartedTestSessionHandle extends TestSessionHandle {
  processId: string
  port: number
}

/** What a started worker reports back about itself. */
export interface TestSessionStart {
  processId: string
  port: number
}

/** A response proxied back from the session's worker. */
export interface TestSessionResponse {
  status: number
  body: unknown
}

/**
 * Runs a generated bundle somewhere disposable so a workflow can be executed
 * before it is deployed. Implementations are DB-free; the API owns session
 * records, quotas and TTL.
 */
export interface TestSessionRunner {
  readonly runtime: TestSessionRuntime

  /**
   * The container/workspace a session id maps to. The API stores this when it
   * records the session, so the reaper can dispose a container whose start
   * never reported back.
   */
  containerId(sessionId: string): string

  /** Scaffolds the workspace, installs dependencies and starts the worker. */
  start(bundle: GeneratedBundle, target: TestSessionTarget): Promise<TestSessionStart>

  /** Invokes the session's `fetch` handler with a JSON payload. */
  trigger(handle: StartedTestSessionHandle, payload: unknown): Promise<TestSessionResponse>

  /** Reads one workflow instance's status out of the running session. */
  instanceStatus(handle: StartedTestSessionHandle, instanceId: string): Promise<TestSessionResponse>

  /** Worker output since `since` (epoch ms), oldest first. */
  logs(handle: StartedTestSessionHandle, since?: number): Promise<ProcessLogEntry[]>

  /**
   * Stops the worker and disposes the container/workspace. Idempotent, and
   * safe for a session that never finished starting.
   */
  stop(handle: TestSessionHandle): Promise<void>
}
