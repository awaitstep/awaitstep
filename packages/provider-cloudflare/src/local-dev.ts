import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  GeneratedArtifact,
  LocalDevOptions,
  LocalDevSession,
  LocalDevLogEntry,
} from '@awaitstep/codegen'
import { generateWranglerConfig } from './wrangler-config.js'
import { workerName, workflowClassName, sanitizedWorkflowName } from './naming.js'

const execFileAsync = promisify(execFile)

const DEFAULT_PORT = 8787
const MAX_LOG_LINES = 500

/** Cloudflare-specific local dev session with deployDir for cleanup. */
interface InternalLocalDevSession extends LocalDevSession {
  deployDir: string
}

export async function startLocalDev(
  artifact: GeneratedArtifact,
  options: LocalDevOptions,
): Promise<InternalLocalDevSession> {
  const name = workerName(options.workflowId)
  const className = workflowClassName(options.workflowName)
  const port = options.port ?? DEFAULT_PORT
  const deployDir = join(tmpdir(), `awaitstep-local-${options.workflowId}-${Date.now()}`)

  await mkdir(deployDir, { recursive: true })

  const scriptPath = join(deployDir, artifact.filename)
  await writeFile(scriptPath, artifact.compiled ?? artifact.source, 'utf-8')

  const wranglerConfig = generateWranglerConfig({
    workerName: name,
    className,
    workflowName: sanitizedWorkflowName(options.workflowName),
    main: `./${artifact.filename}`,
    vars: options.vars,
  })
  await writeFile(join(deployDir, 'wrangler.json'), wranglerConfig, 'utf-8')

  // Write .dev.vars for secrets (wrangler's local secrets mechanism)
  if (options.secrets && Object.keys(options.secrets).length > 0) {
    const devVars = Object.entries(options.secrets)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
    await writeFile(join(deployDir, '.dev.vars'), devVars, 'utf-8')
  }

  // Install npm dependencies if any
  if (options.dependencies && Object.keys(options.dependencies).length > 0) {
    const pkg = { name: 'awaitstep-local-dev', private: true, dependencies: options.dependencies }
    await writeFile(join(deployDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8')
    await execFileAsync(
      'npm',
      ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd: deployDir, timeout: 60_000 },
    )
  }

  const child = spawn('npx', ['wrangler', 'dev', '--port', String(port)], {
    cwd: deployDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  const url = `http://localhost:${port}`

  // Log buffer — ring buffer capped at MAX_LOG_LINES
  const logs: LocalDevLogEntry[] = []

  function appendLog(stream: 'stdout' | 'stderr', data: Buffer) {
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.length > 0)
    const now = Date.now()
    for (const text of lines) {
      logs.push({ timestamp: now, stream, text })
    }
    // Trim to max size
    if (logs.length > MAX_LOG_LINES) {
      logs.splice(0, logs.length - MAX_LOG_LINES)
    }
  }

  child.stdout?.on('data', (data: Buffer) => appendLog('stdout', data))
  child.stderr?.on('data', (data: Buffer) => appendLog('stderr', data))

  await waitForReady(child, url, logs)

  let stopped = false
  async function stop() {
    if (stopped) return
    stopped = true
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      child.on('close', () => resolve())
      setTimeout(resolve, 5_000)
    })
    await rm(deployDir, { recursive: true, force: true }).catch(() => {})
  }

  function getLogs(since?: number): LocalDevLogEntry[] {
    if (!since) return [...logs]
    return logs.filter((l) => l.timestamp > since)
  }

  return {
    port,
    url,
    pid: child.pid!,
    deployDir,
    stop,
    getLogs,
  }
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
