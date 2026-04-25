import type { GeneratedArtifact } from '@awaitstep/codegen'
import type { WranglerDeployer, DeployOptions, WranglerDeployResult } from './deployer.js'
import {
  buildSecretsBulkJson,
  redactSensitive,
  safeFilename,
  SECRETS_BULK_FILENAME,
} from './deployer.js'
import { generateWranglerConfig } from '../wrangler-config.js'
import { workerName, sanitizedWorkflowName, workflowClassName } from '../naming.js'

// The Sandbox instance is injected from the Worker entry point via a factory
// function. We use `any` to avoid importing @cloudflare/sandbox directly so
// this package stays runtime-agnostic. The Sandbox SDK exposes writeFile(),
// exec(), and destroy() methods — see https://developers.cloudflare.com/sandbox/api/

export interface SandboxDeployerOptions {
  /** Maximum wall-clock time (ms) for the entire deploy operation. Default: 5 minutes. */
  maxDeployMs?: number
}

const DEFAULT_MAX_DEPLOY_MS = 5 * 60 * 1000

export class SandboxWranglerDeployer implements WranglerDeployer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getSandbox: (id: string) => any
  private maxDeployMs: number

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(getSandbox: (id: string) => any, options?: SandboxDeployerOptions) {
    this.getSandbox = getSandbox
    this.maxDeployMs = options?.maxDeployMs ?? DEFAULT_MAX_DEPLOY_MS
  }

  async deploy(
    artifact: GeneratedArtifact,
    options: DeployOptions,
    onProgress?: (stage: string, message: string) => void,
  ): Promise<WranglerDeployResult> {
    const name = workerName(options.workflowId)
    const className = options.className ?? workflowClassName(options.workflowName)
    const sandboxId = `deploy-${options.workflowId}-${Date.now()}`.toLowerCase()
    const sandbox = this.getSandbox(sandboxId)
    const filename = safeFilename(artifact.filename)

    // Hard kill timer — destroy the container after 5 minutes regardless
    // of whether processes are still running.
    const killTimer = setTimeout(() => {
      sandbox.destroy().catch(() => {})
    }, this.maxDeployMs)

    try {
      // 1. Write generated code
      onProgress?.('WRITING_FILES', 'Preparing worker files...')
      const scriptContent = artifact.compiled ?? artifact.source
      await sandbox.writeFile(`/workspace/${filename}`, scriptContent)

      // 2. Write wrangler config
      const wranglerConfig = generateWranglerConfig({
        workerName: name,
        className,
        workflowName: sanitizedWorkflowName(options.workflowName),
        main: `./${filename}`,
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
      await sandbox.writeFile('/workspace/wrangler.json', wranglerConfig)

      // 3. Install npm dependencies
      if (options.dependencies && Object.keys(options.dependencies).length > 0) {
        const depNames = Object.keys(options.dependencies)
        onProgress?.(
          'INSTALLING_DEPS',
          `Installing ${depNames.length} ${depNames.length === 1 ? 'dependency' : 'dependencies'}...`,
        )

        const pkg = {
          name: options.packageName ?? 'awaitstep-worker',
          private: true,
          dependencies: options.dependencies,
        }
        await sandbox.writeFile('/workspace/package.json', JSON.stringify(pkg, null, 2))

        const installResult = await sandbox.exec(
          'npm install --omit=dev --ignore-scripts --no-audit --no-fund',
          { cwd: '/workspace', timeout: 60_000 },
        )
        if (!installResult.success) {
          return { success: false, workerName: name, error: redactSensitive(installResult.stderr) }
        }
        onProgress?.('INSTALLING_DEPS', 'Dependencies installed')
      }

      // 4. Deploy with wrangler
      onProgress?.('DEPLOYING', 'Uploading worker to Cloudflare...')
      const deployResult = await sandbox.exec('npx wrangler deploy', {
        cwd: '/workspace',
        timeout: 120_000,
        env: {
          CLOUDFLARE_ACCOUNT_ID: options.accountId,
          CLOUDFLARE_API_TOKEN: options.apiToken,
        },
        stream: true,
        onOutput: (_stream: string, data: string) => {
          const trimmed = data.trim()
          if (trimmed) onProgress?.('DEPLOYING', trimmed)
        },
      })

      if (!deployResult.success) {
        return { success: false, workerName: name, error: redactSensitive(deployResult.stderr) }
      }

      // 5. Upload secrets via bulk
      // The Sandbox SDK's exec() does not support stdin, so we write a JSON
      // file and let `wrangler secret bulk <file>` read it. The file is
      // deleted as soon as the upload finishes; the container is destroyed
      // in the `finally` block regardless.
      const bulk = buildSecretsBulkJson(options.secrets)
      for (const skippedKey of bulk.skipped) {
        onProgress?.('UPLOADING_SECRETS', `Skipping invalid secret key "${skippedKey}"`)
      }
      if (bulk.json) {
        onProgress?.(
          'UPLOADING_SECRETS',
          `Uploading ${bulk.valid.length} ${bulk.valid.length === 1 ? 'secret' : 'secrets'}...`,
        )
        const secretsPath = `/workspace/${SECRETS_BULK_FILENAME}`
        await sandbox.writeFile(secretsPath, bulk.json)
        try {
          const bulkResult = await sandbox.exec(
            `npx wrangler secret bulk ${SECRETS_BULK_FILENAME} --name ${name}`,
            {
              cwd: '/workspace',
              env: {
                CLOUDFLARE_ACCOUNT_ID: options.accountId,
                CLOUDFLARE_API_TOKEN: options.apiToken,
              },
              timeout: 60_000,
            },
          )
          if (!bulkResult.success) {
            return {
              success: false,
              workerName: name,
              error: redactSensitive(bulkResult.stderr),
            }
          }
        } finally {
          await sandbox
            .exec(`rm -f ${SECRETS_BULK_FILENAME}`, { cwd: '/workspace' })
            .catch(() => {})
        }
      }

      // 6. Extract URL
      const urlMatch = deployResult.stdout.match(/https:\/\/[^\s)]+\.workers\.dev/)
      const routeUrl = options.routes?.[0]
        ? `https://${options.routes[0].pattern.replace(/\/\*$/, '')}`
        : undefined

      return { success: true, workerName: name, workerUrl: routeUrl ?? urlMatch?.[0] }
    } catch (err) {
      return { success: false, workerName: name, error: redactSensitive((err as Error).message) }
    } finally {
      clearTimeout(killTimer)
      await sandbox.destroy().catch(() => {})
    }
  }

  async deleteWorker(
    workerNameToDelete: string,
    options: { accountId: string; apiToken: string },
  ): Promise<{ success: boolean; error?: string }> {
    const sandboxId = `delete-${workerNameToDelete}-${Date.now()}`.toLowerCase()
    const sandbox = this.getSandbox(sandboxId)
    try {
      const result = await sandbox.exec(
        `npx wrangler delete --name ${workerNameToDelete} --force`,
        {
          cwd: '/workspace',
          env: {
            CLOUDFLARE_ACCOUNT_ID: options.accountId,
            CLOUDFLARE_API_TOKEN: options.apiToken,
          },
          timeout: 60_000,
        },
      )
      return result.success
        ? { success: true }
        : { success: false, error: redactSensitive(result.stderr) }
    } catch (err) {
      return { success: false, error: redactSensitive((err as Error).message) }
    } finally {
      await sandbox.destroy().catch(() => {})
    }
  }
}
