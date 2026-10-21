import { appendFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'
import type {
  GeneratedBundle,
  ProcessLogEntry,
  StartedTestSessionHandle,
  TestSessionHandle,
  TestSessionLogPage,
  TestSessionResponse,
  TestSessionRunner,
  TestSessionStart,
  TestSessionTarget,
} from '@awaitstep/codegen'
import {
  buildDevWorkspaceFiles,
  installWorkspaceDependencies,
  writeDevWorkspace,
} from '../dev-workspace.js'
import { isPortListening } from '../local-dev.js'
import { logPageFromEntries } from './log-page.js'
import { wranglerCommand, wranglerEnv } from '../wrangler-exec.js'

const SESSIONS_DIR = join(tmpdir(), 'awaitstep-test-sessions')
const LOG_FILE = 'output.log'
const READY_TIMEOUT_MS = 60_000
const READY_POLL_MS = 500

/** Where session ports are taken from, above the single local-dev port. */
export const TEST_SESSION_PORT_RANGE = { from: 8800, to: 8899 }

/**
 * Ports handed out but not yet listening. Choosing a free port and spawning
 * are not one step, so without this two overlapping starts pick the same
 * port: the second would find the first's worker, decide it is ready, and
 * send its triggers to another workflow.
 */
const claimedPorts = new Set<number>()

/**
 * Drops every outstanding claim. The claims only describe this process's
 * in-flight starts, so they are meaningless once it restarts — a shutdown
 * hook (and a test) wants them cleared rather than leaked.
 */
export function releaseClaimedPorts(): void {
  claimedPorts.clear()
}

export interface NodeTestSessionRunnerOptions {
  readyTimeoutMs?: number
  portRange?: { from: number; to: number }
}

/**
 * Runs a test session as a child process on the API host — the self-hosted
 * counterpart of the container runner.
 *
 * Each session owns a directory and a port, unlike local dev's single fixed
 * pair, because several may run at once. Output is appended to a file one
 * JSON line at a time: the request that reads the logs is never the one that
 * started them, and rewriting the whole file on every chunk both corrupts it
 * under concurrent reads and loses the cursor's meaning.
 */
export class NodeTestSessionRunner implements TestSessionRunner {
  readonly runtime = 'node' as const
  private readyTimeoutMs: number
  private portRange: { from: number; to: number }

  constructor(options?: NodeTestSessionRunnerOptions) {
    this.readyTimeoutMs = options?.readyTimeoutMs ?? READY_TIMEOUT_MS
    this.portRange = options?.portRange ?? TEST_SESSION_PORT_RANGE
  }

  containerId(sessionId: string): string {
    return join(SESSIONS_DIR, sessionId)
  }

  async start(bundle: GeneratedBundle, target: TestSessionTarget): Promise<TestSessionStart> {
    const dir = this.containerId(target.sessionId)
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    await writeDevWorkspace(dir, await buildDevWorkspaceFiles(bundle, target))
    await installWorkspaceDependencies(dir, target.dependencies)

    const port = await this.claimPort()
    let child: ChildProcess
    try {
      child = await this.spawnWrangler(dir, port)
    } catch (err) {
      claimedPorts.delete(port)
      throw err
    }

    try {
      await this.waitForReady(child, port, dir)
    } catch (err) {
      await this.stop({
        sessionId: target.sessionId,
        containerId: dir,
        processId: String(child.pid ?? ''),
        port,
      })
      throw err
    }

    claimedPorts.delete(port)
    return { processId: String(child.pid), port }
  }

  async trigger(handle: StartedTestSessionHandle, payload: unknown): Promise<TestSessionResponse> {
    return request(`http://localhost:${handle.port}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    })
  }

  async instanceStatus(
    handle: StartedTestSessionHandle,
    instanceId: string,
  ): Promise<TestSessionResponse> {
    return request(
      `http://localhost:${handle.port}/?instanceId=${encodeURIComponent(instanceId)}`,
      {
        method: 'GET',
      },
    )
  }

  async logs(handle: StartedTestSessionHandle, after?: string): Promise<TestSessionLogPage> {
    const entries = await readLogEntries(handle.containerId)
    return logPageFromEntries(entries, entries.length, after)
  }

  /**
   * Stops the session's process group and removes its workspace.
   *
   * Deliberately not by port: ports are reused, so a late stop for one
   * session would kill whichever session now holds it — and the port-killer's
   * macOS path (`lsof -ti :port | xargs kill -9`) also matches the API's own
   * client connections to that port, which can take down the API itself. The
   * group covers npx and workerd, including a start that never bound a port.
   */
  async stop(handle: TestSessionHandle): Promise<void> {
    const pid = Number(handle.processId)
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        // Already gone, or never started.
      }
    }
    if (handle.port) claimedPorts.delete(handle.port)
    await rm(handle.containerId, { recursive: true, force: true }).catch(() => {})
  }

  /** The first port that is neither listening nor already handed out. */
  private async claimPort(): Promise<number> {
    for (let port = this.portRange.from; port <= this.portRange.to; port++) {
      if (claimedPorts.has(port)) continue
      if (await isPortListening(port)) continue
      claimedPorts.add(port)
      return port
    }
    throw new Error('No free port for a test session')
  }

  private async spawnWrangler(dir: string, port: number): Promise<ChildProcess> {
    // Our own wrangler, by absolute path, with a withheld environment: the
    // workspace's node_modules is user-controlled, and `npx` would prefer
    // whatever `wrangler` it finds there. See wrangler-exec.ts.
    //
    // Detached so the child leads its own process group — node is a wrapper
    // here too, and signalling it alone leaves workerd running.
    const wrangler = wranglerCommand()
    const child = spawn(wrangler.command, [...wrangler.args, 'dev', '--port', String(port)], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: wranglerEnv(undefined, { home: dir }),
    })

    // Without this listener a spawn failure (ENOENT, EMFILE) is an unhandled
    // 'error' event, which takes the whole API process down.
    const spawned = new Promise<ChildProcess>((resolve, reject) => {
      child.once('spawn', () => resolve(child))
      child.once('error', (err) => reject(new Error(`Could not start wrangler: ${err.message}`)))
    })

    const logPath = join(dir, LOG_FILE)
    child.stdout?.on('data', lineWriter(logPath, 'stdout'))
    child.stderr?.on('data', lineWriter(logPath, 'stderr'))

    return spawned
  }

  /**
   * Waits for the port to accept connections, giving up early if the child
   * exits first — otherwise a wrangler that dies on a config error costs the
   * full timeout and reports nothing about why.
   */
  private async waitForReady(child: ChildProcess, port: number, dir: string): Promise<void> {
    const deadline = Date.now() + this.readyTimeoutMs
    let exited: number | null = null
    child.once('exit', (code) => {
      exited = code ?? 0
    })

    while (Date.now() < deadline) {
      if (await isPortListening(port)) return
      if (exited !== null) {
        const tail = (await readLogEntries(dir))
          .slice(-10)
          .map((entry) => entry.text)
          .join('\n')
        throw new Error(`wrangler dev exited with code ${exited}: ${tail}`.slice(0, 600))
      }
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS))
    }
    throw new Error(
      `wrangler dev did not become ready within ${Math.round(this.readyTimeoutMs / 1000)}s`,
    )
  }
}

/**
 * Appends complete lines to the session log. A chunk can end mid-line, so
 * the remainder is held until the rest of it arrives rather than written as
 * an entry the reader would see twice, half each time.
 */
function lineWriter(logPath: string, stream: ProcessLogEntry['stream']) {
  let pending = ''
  return (data: Buffer) => {
    pending += data.toString()
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    const written = lines
      .filter((text) => text.length > 0)
      .map((text) => JSON.stringify({ timestamp: Date.now(), stream, text }))
    if (written.length === 0) return
    void appendFile(logPath, `${written.join('\n')}\n`, 'utf-8').catch(() => {})
  }
}

async function readLogEntries(dir: string): Promise<ProcessLogEntry[]> {
  try {
    const content = await readFile(join(dir, LOG_FILE), 'utf-8')
    return content
      .split('\n')
      .filter((line) => line.length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as ProcessLogEntry]
        } catch {
          // A line still being appended; it will parse on the next read.
          return []
        }
      })
  } catch {
    return []
  }
}

async function request(url: string, init: RequestInit): Promise<TestSessionResponse> {
  const response = await fetch(url, init)
  const text = await response.text()
  let body: unknown = text || null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    // Not JSON — the text is the body.
  }
  return { status: response.status, body }
}
