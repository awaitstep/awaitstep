import type {
  GeneratedBundle,
  StartedTestSessionHandle,
  TestSessionHandle,
  TestSessionLogPage,
  TestSessionResponse,
  TestSessionRunner,
  TestSessionStart,
  TestSessionTarget,
} from '@awaitstep/codegen'
import { assertRegistryDependencies } from '@awaitstep/ir'
import { buildDevWorkspaceFiles } from '../dev-workspace.js'
import { logPageFromBuffers } from './log-page.js'

// The Sandbox instance is injected from the Worker entry point as a factory,
// the same seam the deployer uses: importing @cloudflare/sandbox here would
// tie this package to one runtime. See the deployer for the rationale.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sandbox = any

const WORKSPACE = '/workspace'
const WRANGLER_PORT = 8787
const PROCESS_ID = 'wrangler-dev'
const INSTALL_TIMEOUT_MS = 120_000
const READY_TIMEOUT_MS = 90_000
const DEFAULT_SLEEP_AFTER = '30m'

export interface SandboxTestSessionRunnerOptions {
  /** How long to wait for `wrangler dev` to answer. Default: 90s. */
  readyTimeoutMs?: number
  /**
   * How long the container may idle before the platform sleeps it. Must
   * outlast the session's own idle timeout, or wrangler disappears while the
   * API still believes the session is live. Default: 30m.
   */
  sleepAfter?: string
}

/**
 * Runs a test session in a Cloudflare container: write the bundle, install
 * dependencies, start `wrangler dev` as a background process, then proxy
 * triggers into it.
 *
 * Requests reach the worker through `containerFetch`, not through a preview
 * URL. `exposePort` would publish the session on a wildcard subdomain of our
 * own Worker domain — infrastructure we do not have, and a URL outside our
 * authorization. Proxying keeps the session private and needs nothing new.
 */
export class SandboxTestSessionRunner implements TestSessionRunner {
  readonly runtime = 'sandbox' as const
  private getSandbox: (id: string, options?: { sleepAfter?: string }) => Sandbox
  private readyTimeoutMs: number
  private sleepAfter: string

  constructor(
    getSandbox: (id: string, options?: { sleepAfter?: string }) => Sandbox,
    options?: SandboxTestSessionRunnerOptions,
  ) {
    this.getSandbox = getSandbox
    this.readyTimeoutMs = options?.readyTimeoutMs ?? READY_TIMEOUT_MS
    this.sleepAfter = options?.sleepAfter ?? DEFAULT_SLEEP_AFTER
  }

  /**
   * Always with this session's sleep window. A call that omits it lets the
   * host's default apply, and the host's default is the deploy's — which
   * would put the container to sleep well before the session expires.
   */
  private sandboxFor(containerId: string): Sandbox {
    return this.getSandbox(containerId, { sleepAfter: this.sleepAfter })
  }

  containerId(sessionId: string): string {
    // Sandbox ids are lowercased by the platform; deriving it here means the
    // API can record the container before the container exists.
    return `test-${sessionId}`.toLowerCase()
  }

  async start(bundle: GeneratedBundle, target: TestSessionTarget): Promise<TestSessionStart> {
    const containerId = this.containerId(target.sessionId)
    const sandbox = this.sandboxFor(containerId)

    try {
      const files = await buildDevWorkspaceFiles(bundle, target)
      const nestedDirs = [
        ...new Set(
          files
            .map((file) => file.path)
            .filter((path) => path.includes('/'))
            .map((path) => path.slice(0, path.lastIndexOf('/'))),
        ),
      ]
      if (nestedDirs.length > 0) {
        // The sandbox SDK does not create parent directories.
        await sandbox.exec(`mkdir -p ${nestedDirs.join(' ')}`, { cwd: WORKSPACE })
      }
      for (const file of files) {
        await sandbox.writeFile(`${WORKSPACE}/${file.path}`, file.content)
      }

      if (target.dependencies && Object.keys(target.dependencies).length > 0) {
        assertRegistryDependencies(target.dependencies)
        const install = await sandbox.exec(
          'npm install --omit=dev --ignore-scripts --no-audit --no-fund',
          { cwd: WORKSPACE, timeout: INSTALL_TIMEOUT_MS },
        )
        if (!install.success) {
          throw new Error(`Dependency install failed: ${String(install.stderr).slice(0, 500)}`)
        }
      }

      const process = await sandbox.startProcess(
        `npx wrangler dev --port ${WRANGLER_PORT} --ip 0.0.0.0`,
        {
          cwd: WORKSPACE,
          processId: PROCESS_ID,
          // Keep the record (and its logs) after an exit: a crash on startup
          // is the one case where the output matters most.
          autoCleanup: false,
        },
      )

      const handle: StartedTestSessionHandle = {
        sessionId: target.sessionId,
        containerId,
        processId: String(process?.id ?? PROCESS_ID),
        port: WRANGLER_PORT,
      }
      await this.waitForReady(process, handle)
      return { processId: handle.processId, port: handle.port }
    } catch (err) {
      // Nothing else knows this container exists yet, and it bills from the
      // moment it starts — the reaper would only find it minutes later.
      await sandbox.destroy().catch(() => {})
      throw err
    }
  }

  async trigger(handle: StartedTestSessionHandle, payload: unknown): Promise<TestSessionResponse> {
    return this.proxy(handle, `http://localhost:${handle.port}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    })
  }

  async instanceStatus(
    handle: StartedTestSessionHandle,
    instanceId: string,
  ): Promise<TestSessionResponse> {
    const url = `http://localhost:${handle.port}/?instanceId=${encodeURIComponent(instanceId)}`
    return this.proxy(handle, url, { method: 'GET' })
  }

  async logs(handle: StartedTestSessionHandle, after?: string): Promise<TestSessionLogPage> {
    const sandbox = this.sandboxFor(handle.containerId)
    const output = await sandbox.getProcessLogs(handle.processId)
    return logPageFromBuffers(output ?? {}, after)
  }

  async stop(handle: TestSessionHandle): Promise<void> {
    // Disposing the container stops everything in it, which is why this is
    // safe for a session that never finished starting — the reaper calls it
    // with nothing but the container id.
    await this.sandboxFor(handle.containerId)
      .destroy()
      .catch(() => {})
  }

  private async proxy(
    handle: StartedTestSessionHandle,
    url: string,
    init: RequestInit,
  ): Promise<TestSessionResponse> {
    const sandbox = this.sandboxFor(handle.containerId)
    const response = await sandbox.containerFetch(url, init, handle.port)
    const text = await response.text()
    return { status: response.status, body: parseBody(text) }
  }

  /**
   * Waits until the port is actually accepting connections. Checking for a
   * response is not enough: with nothing listening the SDK answers 500/503
   * itself, so "any response" reports a worker that never came up and hides
   * a crash at startup.
   */
  private async waitForReady(process: Sandbox, handle: StartedTestSessionHandle): Promise<void> {
    try {
      await process.waitForPort(handle.port, {
        mode: 'tcp',
        timeout: this.readyTimeoutMs,
      })
    } catch (err) {
      const logs = await this.logs(handle).catch(() => ({ entries: [], cursor: '' }))
      const tail = logs.entries
        .slice(-10)
        .map((entry) => entry.text)
        .join('\n')
      const reason = tail || (err instanceof Error ? err.message : String(err))
      throw new Error(
        `wrangler dev did not become ready within ${Math.round(
          this.readyTimeoutMs / 1000,
        )}s: ${reason}`.slice(0, 600),
        { cause: err },
      )
    }
  }
}

function parseBody(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
