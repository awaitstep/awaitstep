import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import type { GeneratedArtifact } from '@awaitstep/codegen'
import { generateWranglerConfig } from './wrangler-config.js'
import { workerName, workflowClassName } from './naming.js'

const execFileAsync = promisify(execFile)

const PINNED_COMPATIBILITY_DATE = '2025-04-01'

export interface DeployOptions {
  workflowId: string
  workflowName: string
  accountId: string
  apiToken: string
  compatibilityDate?: string
}

export interface WranglerDeployResult {
  success: boolean
  workerName: string
  error?: string
  stdout?: string
  stderr?: string
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

    const wranglerConfig = generateWranglerConfig({
      workerName: name,
      className,
      workflowName: options.workflowName,
      compatibilityDate: options.compatibilityDate ?? PINNED_COMPATIBILITY_DATE,
      main: `./${artifact.filename}`,
    })
    await writeFile(join(deployDir, 'wrangler.json'), wranglerConfig, 'utf-8')

    const wranglerBin = resolveWranglerBin()

    const { stdout, stderr } = await execFileAsync(wranglerBin, ['deploy'], {
      cwd: deployDir,
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: options.accountId,
        CLOUDFLARE_API_TOKEN: options.apiToken,
      },
      timeout: 120_000,
    })

    return { success: true, workerName: name, stdout, stderr }
  } catch (err) {
    const error = err as Error & { stdout?: string; stderr?: string }
    return {
      success: false,
      workerName: name,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr,
    }
  } finally {
    await rm(deployDir, { recursive: true, force: true }).catch(() => {})
  }
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
