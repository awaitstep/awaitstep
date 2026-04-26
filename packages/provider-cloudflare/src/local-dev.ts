import { writeFile, mkdir, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile, exec, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { createConnection } from 'node:net'
import type { GeneratedArtifact, LocalDevOptions, LocalDevLogEntry } from '@awaitstep/codegen'
import { detectBindingsFromSource } from './codegen/bindings.js'
import { generateWranglerConfig } from './wrangler-config.js'
import { workerName, workflowClassName, sanitizedWorkflowName } from './naming.js'

const execFileAsync = promisify(execFile)
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
export async function readLogs(since?: number): Promise<LocalDevLogEntry[]> {
  try {
    const content = await readFile(LOG_FILE, 'utf-8')
    const logs: LocalDevLogEntry[] = JSON.parse(content)
    if (!since) return logs.slice(-MAX_LOG_LINES)
    return logs.filter((l) => l.timestamp > since)
  } catch {
    return []
  }
}

export async function startLocalDev(
  artifact: GeneratedArtifact,
  options: LocalDevOptions,
): Promise<{ port: number; url: string; pid: number }> {
  await killPort(LOCAL_DEV_PORT)

  // Wipe and recreate fixed deploy dir
  await rm(LOCAL_DEV_DIR, { recursive: true, force: true }).catch(() => {})
  await scaffoldDeployDir(artifact, options)
  await installDependencies(LOCAL_DEV_DIR, options.dependencies)

  const child = spawn(
    'npx',
    ['wrangler', 'dev', '--port', String(LOCAL_DEV_PORT), '--ip', '0.0.0.0'],
    { cwd: LOCAL_DEV_DIR, stdio: ['ignore', 'pipe', 'pipe'], detached: false },
  )

  const logs: LocalDevLogEntry[] = []
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
  await waitForReady(child, fallbackUrl, logs)
  // Wait briefly for wrangler to print the additional IP lines after "Ready on"
  await new Promise((r) => setTimeout(r, 1000))

  return { port: LOCAL_DEV_PORT, url: externalUrl || fallbackUrl, pid: child.pid! }
}

async function scaffoldDeployDir(
  artifact: GeneratedArtifact,
  options: LocalDevOptions,
): Promise<void> {
  await mkdir(LOCAL_DEV_DIR, { recursive: true })

  await writeFile(
    join(LOCAL_DEV_DIR, artifact.filename),
    artifact.compiled ?? artifact.source,
    'utf-8',
  )

  const bindings = detectBindingsFromSource(artifact.source)
  const isScript = options.kind === 'script'
  const wranglerConfig = generateWranglerConfig({
    kind: options.kind,
    workerName: workerName(options.workflowId),
    // Scripts have no `WorkflowEntrypoint` class — omit className/workflowName.
    ...(isScript
      ? {}
      : {
          className: workflowClassName(options.workflowName),
          workflowName: sanitizedWorkflowName(options.workflowName),
        }),
    main: `./${artifact.filename}`,
    vars: options.vars,
    bindings: bindings.length > 0 ? bindings : undefined,
    localDev: true,
  })
  await writeFile(join(LOCAL_DEV_DIR, 'wrangler.json'), wranglerConfig, 'utf-8')

  if (options.secrets && Object.keys(options.secrets).length > 0) {
    const devVars = Object.entries(options.secrets)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
    await writeFile(join(LOCAL_DEV_DIR, '.dev.vars'), devVars, 'utf-8')
  }
}

async function installDependencies(
  deployDir: string,
  dependencies?: Record<string, string>,
): Promise<void> {
  if (!dependencies || Object.keys(dependencies).length === 0) return
  const pkg = { name: 'awaitstep-local-dev', private: true, dependencies }
  await writeFile(join(deployDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8')
  await execFileAsync(
    'npm',
    ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: deployDir, timeout: 60_000 },
  )
}

function waitForReady(child: ChildProcess, url: string, logs: LocalDevLogEntry[]): Promise<void> {
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
