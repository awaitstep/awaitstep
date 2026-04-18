import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { GeneratedArtifact } from '@awaitstep/codegen'
import type { WranglerDeployer, DeployOptions, WranglerDeployResult } from './deployer.js'
import { validateSecretKey, redactSensitive, safeFilename } from './deployer.js'
import { generateWranglerConfig } from '../wrangler-config.js'
import { workerName, workflowClassName, sanitizedWorkflowName } from '../naming.js'

const execFileAsync = promisify(execFile)

export class NodeWranglerDeployer implements WranglerDeployer {
  async deploy(
    artifact: GeneratedArtifact,
    options: DeployOptions,
    onProgress?: (stage: string, message: string) => void,
  ): Promise<WranglerDeployResult> {
    const name = workerName(options.workflowId)
    const className = options.className ?? workflowClassName(options.workflowName)
    const deployDir = join(tmpdir(), `awaitstep-deploy-${Date.now()}`)
    const filename = safeFilename(artifact.filename)

    try {
      await mkdir(deployDir, { recursive: true })

      // 1. Write generated code
      onProgress?.('WRITING_FILES', 'Preparing worker files...')
      await writeFile(join(deployDir, filename), artifact.compiled ?? artifact.source, 'utf-8')

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
      await writeFile(join(deployDir, 'wrangler.json'), wranglerConfig, 'utf-8')

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
        await writeFile(join(deployDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8')

        await execFileAsync(
          'npm',
          ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
          { cwd: deployDir, timeout: 60_000 },
        )
        onProgress?.('INSTALLING_DEPS', 'Dependencies installed')
      }

      // 4. Deploy with wrangler
      const wranglerEnv = {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: options.accountId,
        CLOUDFLARE_API_TOKEN: options.apiToken,
      }

      onProgress?.('DEPLOYING', 'Uploading worker to Cloudflare...')
      const { stdout } = await execFileAsync('npx', ['wrangler', 'deploy'], {
        cwd: deployDir,
        env: wranglerEnv,
        timeout: 120_000,
      })

      // 5. Upload secrets
      if (options.secrets && Object.keys(options.secrets).length > 0) {
        const secretKeys = Object.keys(options.secrets)
        for (let i = 0; i < secretKeys.length; i++) {
          const key = secretKeys[i]
          if (!validateSecretKey(key)) {
            onProgress?.('UPLOADING_SECRETS', `Skipping invalid secret key "${key}"`)
            continue
          }
          onProgress?.('UPLOADING_SECRETS', `Setting secret ${i + 1} of ${secretKeys.length}...`)
          await putSecret(key, options.secrets[key], name, wranglerEnv)
        }
      }

      // 6. Extract URL
      const urlMatch = stdout.match(/https:\/\/[^\s)]+\.workers\.dev/)
      const routeUrl = options.routes?.[0]
        ? `https://${options.routes[0].pattern.replace(/\/\*$/, '')}`
        : undefined
      return { success: true, workerName: name, workerUrl: routeUrl ?? urlMatch?.[0] }
    } catch (err) {
      const error = err as Error & { stderr?: string }
      const safeError = error.stderr
        ? redactSensitive(error.stderr)
        : redactSensitive(error.message)
      return { success: false, workerName: name, error: safeError }
    } finally {
      await rm(deployDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async deleteWorker(
    name: string,
    options: { accountId: string; apiToken: string },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await execFileAsync('npx', ['wrangler', 'delete', '--name', name, '--force'], {
        env: {
          ...process.env,
          CLOUDFLARE_ACCOUNT_ID: options.accountId,
          CLOUDFLARE_API_TOKEN: options.apiToken,
        },
        timeout: 60_000,
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: redactSensitive((err as Error).message) }
    }
  }
}

function putSecret(
  key: string,
  value: string,
  name: string,
  env: Record<string, string | undefined>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'secret', 'put', key, '--name', name], {
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
