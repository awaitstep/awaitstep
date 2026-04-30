import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GeneratedArtifact } from '@awaitstep/codegen'
import type { BindingRequirement } from './codegen/bindings.js'
import type { SubWorkflowBinding } from './codegen/generators/sub-workflow.js'
import { buildSecretsBulkJson, SECRETS_BULK_FILENAME } from './deploy/deployer.js'
import { generateWranglerConfig } from './wrangler-config.js'
import { workerName, workflowClassName, sanitizedWorkflowName } from './naming.js'

const execFileAsync = promisify(execFile)

export interface DeployOptions {
  workflowId: string
  workflowName: string
  accountId: string
  apiToken: string
  packageName?: string
  vars?: Record<string, string>
  secrets?: Record<string, string>
  dependencies?: Record<string, string>
  bindings?: BindingRequirement[]
  subWorkflowBindings?: SubWorkflowBinding[]
  previewUrls?: boolean
  workersDev?: boolean
  routes?: Array<{ pattern: string; zone_name: string }>
  customDomains?: string[]
  compatibilityDate?: string
  compatibilityFlags?: string[]
  cronTriggers?: string[]
  placement?: { mode: string }
  limits?: { cpuMs?: number }
  observability?: { enabled: boolean; headSamplingRate?: number }
  logpush?: boolean
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

    const wranglerConfig = generateWranglerConfig({
      workerName: name,
      className,
      workflowName: sanitizedWorkflowName(options.workflowName),
      main: `./${artifact.filename}`,
      vars: options.vars,
      bindings: options.bindings,
      subWorkflowBindings: options.subWorkflowBindings,
      previewUrls: options.previewUrls,
      workersDev: options.workersDev,
      routes: options.routes,
      customDomains: options.customDomains,
      compatibilityDate: options.compatibilityDate,
      compatibilityFlags: options.compatibilityFlags,
      cronTriggers: options.cronTriggers,
      placement: options.placement,
      limits: options.limits,
      observability: options.observability,
      logpush: options.logpush,
    })
    await writeFile(join(deployDir, 'wrangler.json'), wranglerConfig, 'utf-8')

    // Install npm dependencies if any
    if (options.dependencies && Object.keys(options.dependencies).length > 0) {
      const pkg = {
        name: options.packageName ?? 'awaitstep-worker',
        private: true,
        dependencies: options.dependencies,
      }
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

    const wranglerEnv = {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: options.accountId,
      CLOUDFLARE_API_TOKEN: options.apiToken,
    }

    const { stdout } = await execFileAsync('npx', ['wrangler@4.82.2', 'deploy'], {
      cwd: deployDir,
      env: wranglerEnv,
      timeout: 120_000,
    })

    // Upload secrets via `wrangler secret bulk` (after deploy so the worker exists)
    const bulk = buildSecretsBulkJson(options.secrets)
    if (bulk.json) {
      const secretsPath = join(deployDir, SECRETS_BULK_FILENAME)
      await writeFile(secretsPath, bulk.json, 'utf-8')
      try {
        await execFileAsync(
          'npx',
          ['wrangler@4.82.2', 'secret', 'bulk', SECRETS_BULK_FILENAME, '--name', name],
          { cwd: deployDir, env: wranglerEnv, timeout: 60_000 },
        )
      } finally {
        await rm(secretsPath, { force: true }).catch(() => {})
      }
    }

    const urlMatch = stdout.match(/https:\/\/[^\s)]+\.workers\.dev/)
    const routeUrl = options.routes?.[0]
      ? `https://${options.routes[0].pattern.replace(/\/\*$/, '')}`
      : undefined
    return { success: true, workerName: name, workerUrl: routeUrl ?? urlMatch?.[0] }
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
    await execFileAsync('npx', ['wrangler', 'delete', '--name', workerName, '--force'], {
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
