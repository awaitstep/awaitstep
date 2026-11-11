import { writeFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { assertSafeBundlePath, bundleDeployFiles, bundlePackageManifest } from '@awaitstep/codegen'
import type { GeneratedBundle } from '@awaitstep/codegen'
import type { WranglerDeployer, DeployOptions, WranglerDeployResult } from './deployer.js'
import { buildSecretsBulkJson, redactSensitive, SECRETS_BULK_FILENAME } from './deployer.js'
import { DEFAULT_WORKER_PACKAGE_NAME, buildWorkerPackageJson } from './package-manifest.js'
import { generateWranglerConfig } from '../wrangler-config.js'
import { workerName, workflowClassName, sanitizedWorkflowName } from '../naming.js'
import { wranglerCommand, wranglerEnv } from '../wrangler-exec.js'
import { prepareHostDeploy } from '../dev-workspace.js'

const execFileAsync = promisify(execFile)

export class NodeWranglerDeployer implements WranglerDeployer {
  async deploy(
    bundle: GeneratedBundle,
    options: DeployOptions,
    onProgress?: (stage: string, message: string) => void,
  ): Promise<WranglerDeployResult> {
    const name = workerName(options.workflowId)
    const className = options.className ?? workflowClassName(options.workflowName)
    const deployDir = join(tmpdir(), `awaitstep-deploy-${Date.now()}`)
    // Beside the project, not inside it: the checked build is what uploads.
    const buildDir = `${deployDir}-build`

    try {
      await mkdir(deployDir, { recursive: true })

      // 1. Write the bundle: generated code, project modules, assets, config
      onProgress?.('WRITING_FILES', 'Preparing worker files...')
      const entryPath = assertSafeBundlePath(bundle.entry)
      for (const file of bundleDeployFiles(bundle)) {
        const target = join(deployDir, assertSafeBundlePath(file.path))
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, file.compiled ?? file.source, 'utf-8')
      }

      // 2. Write wrangler config
      const wranglerConfig = generateWranglerConfig({
        kind: options.kind,
        workerName: name,
        className,
        workflowName: sanitizedWorkflowName(options.workflowName),
        main: `./${entryPath}`,
        vars: options.vars,
        bindings: options.bindings,
        subWorkflowBindings: options.subWorkflowBindings,
        subScriptBindings: options.subScriptBindings,
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
        queueConsumers: options.queueConsumers,
      })
      await writeFile(join(deployDir, 'wrangler.json'), wranglerConfig, 'utf-8')

      // 3. package.json (project manifest + #/ import map) and npm dependencies
      await writeFile(
        join(deployDir, 'package.json'),
        buildWorkerPackageJson({
          name: options.packageName ?? DEFAULT_WORKER_PACKAGE_NAME,
          dependencies: options.dependencies,
          manifestSource: bundlePackageManifest(bundle),
        }),
        'utf-8',
      )
      // Install, build, and prove the build reads nothing outside the
      // directory — then upload that build, not a second one.
      await mkdir(buildDir, { recursive: true })
      const builtEntry = await prepareHostDeploy(
        deployDir,
        options.dependencies,
        buildDir,
        onProgress,
      )

      // 4. Write secrets for the same upload. `wrangler secret bulk` after a
      // deploy creates a second version (and a second deployment in
      // Cloudflare); `--secrets-file` attaches them to this one.
      const bulk = buildSecretsBulkJson(options.secrets)
      for (const skippedKey of bulk.skipped) {
        onProgress?.('UPLOADING_SECRETS', `Skipping invalid secret key "${skippedKey}"`)
      }
      if (bulk.json) {
        onProgress?.(
          'UPLOADING_SECRETS',
          `Uploading ${bulk.valid.length} ${bulk.valid.length === 1 ? 'secret' : 'secrets'}...`,
        )
        await writeFile(join(deployDir, SECRETS_BULK_FILENAME), bulk.json, 'utf-8')
      }

      // 5. Deploy with wrangler
      // An allow-listed environment, not the API's: this runs in a directory
      // whose dependencies the user chose. The credentials are added
      // deliberately because a deploy needs them.
      const deployEnv = wranglerEnv({
        CLOUDFLARE_ACCOUNT_ID: options.accountId,
        CLOUDFLARE_API_TOKEN: options.apiToken,
      })

      onProgress?.('DEPLOYING', 'Uploading worker to Cloudflare...')
      const wrangler = wranglerCommand()
      // `-c` because a script argument otherwise makes wrangler look for a
      // config beside the script — and deploy without bindings.
      const { stdout } = await execFileAsync(
        wrangler.command,
        [
          ...wrangler.args,
          'deploy',
          '-c',
          'wrangler.json',
          '--no-bundle',
          ...(bulk.json ? ['--secrets-file', SECRETS_BULK_FILENAME] : []),
          builtEntry,
        ],
        { cwd: deployDir, env: deployEnv, timeout: 120_000 },
      )

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
      await rm(buildDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  async deleteWorker(
    name: string,
    options: { accountId: string; apiToken: string },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const wrangler = wranglerCommand()
      await execFileAsync(
        wrangler.command,
        [...wrangler.args, 'delete', '--name', name, '--force'],
        {
          env: wranglerEnv({
            CLOUDFLARE_ACCOUNT_ID: options.accountId,
            CLOUDFLARE_API_TOKEN: options.apiToken,
          }),
          timeout: 60_000,
        },
      )
      return { success: true }
    } catch (err) {
      return { success: false, error: redactSensitive((err as Error).message) }
    }
  }
}
