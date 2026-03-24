import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import type { GeneratedArtifact } from '@awaitstep/codegen'
import { generateWranglerConfig } from './wrangler-config.js'
import { workerName, workflowClassName, sanitizedWorkflowName } from './naming.js'

const execFileAsync = promisify(execFile)

const PINNED_COMPATIBILITY_DATE = '2025-04-01'

export interface DeployOptions {
  workflowId: string
  workflowName: string
  accountId: string
  apiToken: string
  compatibilityDate?: string
  vars?: Record<string, string>
  secrets?: Record<string, string>
  dependencies?: Record<string, string>
}

export interface WranglerDeployResult {
  success: boolean
  workerName: string
  workerUrl?: string
  error?: string
}

export async function deployWithWrangler(
  artifact: GeneratedArtifact,
  options: DeployOptions,
): Promise<WranglerDeployResult> {
  const name = workerName(options.workflowId)
  const className = workflowClassName(options.workflowName)
  const deployDir = join(tmpdir(), `awaitstep-deploy-${Date.now()}`)

  try {
    await mkdir(deployDir, { recursive: true })

    const scriptPath = join(deployDir, artifact.filename)
    await writeFile(scriptPath, artifact.compiled ?? artifact.source, 'utf-8')

    const hasDeps = options.dependencies && Object.keys(options.dependencies).length > 0
    const wranglerConfig = generateWranglerConfig({
      workerName: name,
      className,
      workflowName: sanitizedWorkflowName(options.workflowName),
      compatibilityDate: options.compatibilityDate ?? PINNED_COMPATIBILITY_DATE,
      main: `./${artifact.filename}`,
      vars: options.vars,
      nodeCompat: !!hasDeps,
    })
    await writeFile(join(deployDir, 'wrangler.json'), wranglerConfig, 'utf-8')

    // Install npm dependencies if any
    if (options.dependencies && Object.keys(options.dependencies).length > 0) {
      const pkg = { name: 'awaitstep-worker', private: true, dependencies: options.dependencies }
      await writeFile(join(deployDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8')
      await execFileAsync(
        'npm',
        ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
        {
          cwd: deployDir,
          timeout: 60_000,
        },
      )
    }

    const wranglerBin = resolveWranglerBin()
    const wranglerEnv = {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: options.accountId,
      CLOUDFLARE_API_TOKEN: options.apiToken,
    }

    const { stdout } = await execFileAsync(wranglerBin, ['deploy'], {
      cwd: deployDir,
      env: wranglerEnv,
      timeout: 120_000,
    })

    // Upload secrets via wrangler secret put (after deploy so the worker exists)
    if (options.secrets) {
      for (const [key, value] of Object.entries(options.secrets)) {
        await putSecret(wranglerBin, key, value, name, wranglerEnv)
      }
    }

    const urlMatch = stdout.match(/https:\/\/[^\s)]+\.workers\.dev/)
    return { success: true, workerName: name, workerUrl: urlMatch?.[0] }
  } catch (err) {
    const error = err as Error & { stderr?: string }
    const safeError = error.stderr
      ? error.stderr.replace(/[A-Za-z0-9_-]{30,}/g, '[REDACTED]')
      : error.message
    return {
      success: false,
      workerName: name,
      error: safeError,
    }
  } finally {
    await rm(deployDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function deleteWorker(
  workerName: string,
  options: { accountId: string; apiToken: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const wranglerBin = resolveWranglerBin()
    await execFileAsync(wranglerBin, ['delete', '--name', workerName, '--force'], {
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: options.accountId,
        CLOUDFLARE_API_TOKEN: options.apiToken,
      },
      timeout: 60_000,
    })
    return { success: true }
  } catch (err) {
    const error = err as Error
    return { success: false, error: error.message }
  }
}

function putSecret(
  wranglerBin: string,
  key: string,
  value: string,
  workerName: string,
  env: Record<string, string | undefined>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(wranglerBin, ['secret', 'put', key, '--name', workerName], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    })
    child.stdin.write(value)
    child.stdin.end()
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`wrangler secret put ${key} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

function resolveWranglerBin(): string {
  try {
    const require = createRequire(import.meta.url)
    const wranglerPkg = require.resolve('wrangler/package.json')
    return join(dirname(wranglerPkg), 'bin', 'wrangler.js')
  } catch {
    return 'wrangler'
  }
}
