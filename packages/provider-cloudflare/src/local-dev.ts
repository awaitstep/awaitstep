import { writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exec, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { createConnection } from 'node:net'
import type { GeneratedBundle, LocalDevOptions, ProcessLogEntry } from '@awaitstep/codegen'
import {
  buildDevWorkspaceFiles,
  installWorkspaceDependencies,
  writeDevWorkspace,
} from './dev-workspace.js'
import { wranglerCommand, wranglerEnv } from './wrangler-exec.js'

const execAsync = promisify(exec)

export const LOCAL_DEV_PORT = 8787
const LOCAL_DEV_DIR = join(tmpdir(), 'awaitstep-local-dev')
const LOG_FILE = join(LOCAL_DEV_DIR, 'output.log')
const MAX_LOG_LINES = 500

/** Kill whatever process is listening on the given port. */
export async function killPort(port: number = LOCAL_DEV_PORT): Promise<void> {
  // Try fuser (Debian/slim), then lsof (macOS), then ss+kill (fallback)
  const commands = [
    `fuser -k ${port}/tcp`,
    `lsof -ti :${port} | xargs kill -9`,
    `ss -tlnp sport = :${port} | grep -oP 'pid=\\K[0-9]+' | xargs -r kill -9`,
  ]

  for (const cmd of commands) {
    try {
      await execAsync(cmd)
      await new Promise((r) => setTimeout(r, 500))
      return
    } catch {
      // Command not available or no process — try next
    }
  }
}

/** Check if a port is currently listening. */
export function isPortListening(port: number = LOCAL_DEV_PORT): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: 'localhost' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      resolve(false)
    })
  })
}

/** Read logs from the local dev log file. */
export async function readLogs(since?: number): Promise<ProcessLogEntry[]> {
  try {
    const content = await readFile(LOG_FILE, 'utf-8')
    const logs: ProcessLogEntry[] = JSON.parse(content)
    if (!since) return logs.slice(-MAX_LOG_LINES)
    return logs.filter((l) => l.timestamp > since)
  } catch {
    return []
  }
}

export async function startLocalDev(
  bundle: GeneratedBundle,
  options: LocalDevOptions,
): Promise<{ port: number; url: string; pid: number }> {
  await killPort(LOCAL_DEV_PORT)

  // Wipe and recreate fixed deploy dir
  await rm(LOCAL_DEV_DIR, { recursive: true, force: true }).catch(() => {})
  await writeDevWorkspace(LOCAL_DEV_DIR, await buildDevWorkspaceFiles(bundle, options))
  await installWorkspaceDependencies(LOCAL_DEV_DIR, options.dependencies)

  // Our own wrangler by absolute path, with a withheld environment — the
  // workspace's node_modules is user-controlled and `npx` would search it
  // first. See wrangler-exec.ts.
  //
  // Detached so the child leads its own process group: signalling the node
  // wrapper alone leaves workerd running. The group is what gets killed if
  // the start never finishes.
  const wrangler = wranglerCommand()
  const child = spawn(
    wrangler.command,
    [...wrangler.args, 'dev', '--port', String(LOCAL_DEV_PORT), '--ip', '0.0.0.0'],
    {
      cwd: LOCAL_DEV_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: wranglerEnv(undefined, { home: LOCAL_DEV_DIR }),
    },
  )

  const logs: ProcessLogEntry[] = []
  let externalUrl = ''

  function appendLog(stream: 'stdout' | 'stderr', data: Buffer) {
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.length > 0)
    const now = Date.now()
    for (const text of lines) {
      logs.push({ timestamp: now, stream, text })
      if (logs.length > MAX_LOG_LINES) logs.splice(0, logs.length - MAX_LOG_LINES)
      // Capture the last non-loopback URL from wrangler output
      const urlMatch = text.match(/https?:\/\/([\d.]+):(\d+)/)
      if (urlMatch) {
        const ip = urlMatch[1]
        if (ip !== '0.0.0.0' && ip !== '127.0.0.1') {
          externalUrl = `http://${ip}:${urlMatch[2]}`
        }
      }
    }
    // Persist to file so logs survive without session state
    writeFile(LOG_FILE, JSON.stringify(logs), 'utf-8').catch(() => {})
  }

  child.stdout?.on('data', (data: Buffer) => appendLog('stdout', data))
  child.stderr?.on('data', (data: Buffer) => appendLog('stderr', data))

  const fallbackUrl = `http://localhost:${LOCAL_DEV_PORT}`
  try {
    await waitForReady(child, fallbackUrl, logs)
  } catch (err) {
    // The caller only gets a rejection, so nothing else would ever stop this
    // child. Freeing the port is not enough on its own: a start that times
    // out while npx is still downloading has nothing listening yet, and
    // wrangler would bind the port afterwards and keep running.
    // The group includes npx and anything it spawned, so this also stops a
    // wrangler that had not bound the port yet.
    killProcessGroup(child)
    throw err
  }
  // Wait briefly for wrangler to print the additional IP lines after "Ready on"
  await new Promise((r) => setTimeout(r, 1000))

  return { port: LOCAL_DEV_PORT, url: externalUrl || fallbackUrl, pid: child.pid! }
}

function killProcessGroup(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

function waitForReady(child: ChildProcess, url: string, logs: ProcessLogEntry[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('wrangler dev did not start within 30 seconds'))
    }, 30_000)

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      if (text.includes('Ready on') || text.includes(url)) {
        clearTimeout(timeout)
        resolve()
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout)
        const recentStderr = logs
          .filter((l) => l.stream === 'stderr')
          .slice(-10)
          .map((l) => l.text)
          .join('\n')
        reject(new Error(`wrangler dev exited with code ${code}: ${recentStderr.slice(0, 500)}`))
      }
    })
  })
}
