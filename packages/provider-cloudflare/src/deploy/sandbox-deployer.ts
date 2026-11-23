import { assertRegistryDependencies } from '@awaitstep/ir'
import { assertSafeBundlePath, bundleDeployFiles, bundlePackageManifest } from '@awaitstep/codegen'
import type { GeneratedBundle } from '@awaitstep/codegen'
import type {
  BuildOptions,
  DeployControl,
  WranglerDeployer,
  DeployOptions,
  WorkerBuild,
  WorkerBuildModule,
  WranglerDeployResult,
} from './deployer.js'
import { attachedModuleType } from './module-rules.js'
import { DeployCancelledError } from './run-to-end.js'
import { buildSecretsBulkJson, redactSensitive, SECRETS_BULK_FILENAME } from './deployer.js'
import {
  DEFAULT_WORKER_PACKAGE_NAME,
  buildWorkerPackageJson,
  hasDependencies,
} from './package-manifest.js'
import { generateWranglerConfig } from '../wrangler-config.js'
import { workerName, sanitizedWorkflowName, workflowClassName } from '../naming.js'
import { deployedWorkerUrl } from './worker-url.js'
import { posix } from 'node:path'

// The Sandbox instance is injected from the Worker entry point via a factory
// function. We use `any` to avoid importing @cloudflare/sandbox directly so
// this package stays runtime-agnostic. The Sandbox SDK exposes writeFile(),
// exec(), and destroy() methods — see https://developers.cloudflare.com/sandbox/api/

export interface SandboxDeployerOptions {
  /** Maximum wall-clock time (ms) for the entire deploy operation. Default: 5 minutes. */
  maxDeployMs?: number
}

const DEFAULT_MAX_DEPLOY_MS = 5 * 60 * 1000

/**
 * A progress line as the page may see it: the worker's workers.dev address
 * stays on the server (D-8) — the API runs it, and the page has no use for it.
 */
export function withoutWorkerUrl(line: string): string {
  return line.replace(/https:\/\/[^\s)]+\.workers\.dev\S*/g, '<workers.dev URL>')
}

/**
 * A fresh container per run: unique, so two runs in the same millisecond never
 * share one, and within the SDK's 63-character limit whatever the workflow's
 * name (an id built from it could pass the limit, and `getSandbox` throws).
 */
function sandboxIdFor(purpose: 'build' | 'deploy' | 'delete'): string {
  return `${purpose}-${crypto.randomUUID()}`
}

// Outside /workspace: a dry-run's output is never part of the project it builds.
const BUILD_DIR = '/tmp/awaitstep-build'
const METAFILE = '/tmp/awaitstep-build-meta.json'

/** The bundled entry's path inside BUILD_DIR, from wrangler's metafile. */
function bundledEntry(metafileSource: string): string {
  const metafile = JSON.parse(metafileSource) as {
    outputs: Record<string, { entryPoint?: string }>
  }
  const entries = Object.entries(metafile.outputs)
    .filter(([path, output]) => output.entryPoint !== undefined && path.endsWith('.js'))
    // Output keys are relative to /workspace, where wrangler ran.
    .map(([path]) => posix.resolve('/workspace', path))
    .filter((path) => path.startsWith(`${BUILD_DIR}/`))
  if (entries.length !== 1) {
    throw new Error(`Expected one bundled entry, found ${entries.length}`)
  }
  return entries[0]!.slice(BUILD_DIR.length + 1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readText(sandbox: any, path: string): Promise<string> {
  return new TextDecoder().decode(await readBytes(sandbox, path))
}

/** A file's bytes; binary files come back base64-encoded. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readBytes(sandbox: any, path: string): Promise<Uint8Array> {
  const result = await sandbox.readFile(path, { encoding: 'base64' })
  if (!result.success) throw new Error(`Could not read ${path} from the build`)
  if (result.encoding === 'utf-8') return new TextEncoder().encode(result.content as string)
  return Uint8Array.from(atob(result.content as string), (c) => c.charCodeAt(0))
}

export class SandboxWranglerDeployer implements WranglerDeployer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getSandbox: (id: string) => any
  private maxDeployMs: number

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(getSandbox: (id: string) => any, options?: SandboxDeployerOptions) {
    this.getSandbox = getSandbox
    this.maxDeployMs = options?.maxDeployMs ?? DEFAULT_MAX_DEPLOY_MS
  }

  /**
   * Runs `work` in a fresh sandbox that a hard timer, or a cancel, destroys.
   * `keepRunning` detaches the cancel: past it the work runs to its end.
   */
  private async inSandbox<T>(
    id: string,
    signal: AbortSignal | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    work: (sandbox: any, keepRunning: () => void) => Promise<T>,
  ): Promise<T> {
    const sandbox = this.getSandbox(id)
    // Hard kill timer — destroy the container after 5 minutes regardless
    // of whether processes are still running.
    const killTimer = setTimeout(() => {
      sandbox.destroy().catch(() => {})
    }, this.maxDeployMs)
    // A cancel destroys the container the same way: whatever runs in it stops,
    // and the step waiting on it fails. Each step's result is read only after
    // checking the signal, so a cancel never reads as a failure.
    const stopOnCancel = () => {
      sandbox.destroy().catch(() => {})
    }
    signal?.addEventListener('abort', stopOnCancel, { once: true })
    try {
      return await work(sandbox, () => signal?.removeEventListener('abort', stopOnCancel))
    } finally {
      clearTimeout(killTimer)
      signal?.removeEventListener('abort', stopOnCancel)
      await sandbox.destroy().catch(() => {})
    }
  }

  /**
   * Writes the bundle, wrangler.json and package.json into `/workspace` and
   * installs the dependencies: everything before the build and the upload.
   * `'cancelled'` when the signal aborted between steps.
   */
  private async stage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sandbox: any,
    bundle: GeneratedBundle,
    options: BuildOptions,
    className: string,
    onProgress: ((stage: string, message: string) => void) | undefined,
    signal: AbortSignal | undefined,
  ): Promise<'cancelled' | { error: string } | { entryPath: string; wranglerConfig: string }> {
    const name = workerName(options.workflowId)

    // 1. Write generated code (entry + any per-node modules).
    onProgress?.('WRITING_FILES', 'Preparing worker files...')
    const entryPath = assertSafeBundlePath(bundle.entry)
    const deployFiles = bundleDeployFiles(bundle)
    const nestedDirs = [
      ...new Set(
        deployFiles
          .map((f) => assertSafeBundlePath(f.path))
          .filter((p) => p.includes('/'))
          .map((p) => p.slice(0, p.lastIndexOf('/'))),
      ),
    ]
    if (nestedDirs.length > 0) {
      // The sandbox SDK does not auto-create parent directories.
      await sandbox.exec(`mkdir -p ${nestedDirs.join(' ')}`, { cwd: '/workspace' })
    }
    for (const file of deployFiles) {
      // After a cancel's destroy the next call may start a fresh container:
      // stop between steps instead of carrying on in it.
      if (signal?.aborted) return 'cancelled'
      await sandbox.writeFile(`/workspace/${file.path}`, file.compiled ?? file.source)
    }
    if (signal?.aborted) return 'cancelled'

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
    await sandbox.writeFile('/workspace/wrangler.json', wranglerConfig)
    if (signal?.aborted) return 'cancelled'

    // 3. package.json (project manifest + #/ import map) and npm dependencies
    await sandbox.writeFile(
      '/workspace/package.json',
      buildWorkerPackageJson({
        name: options.packageName ?? DEFAULT_WORKER_PACKAGE_NAME,
        dependencies: options.dependencies,
        manifestSource: bundlePackageManifest(bundle),
        libraryModules: bundle.libraryModules,
      }),
    )
    if (signal?.aborted) return 'cancelled'
    if (hasDependencies(options.dependencies)) {
      assertRegistryDependencies(options.dependencies)
      const depNames = Object.keys(options.dependencies)
      onProgress?.(
        'INSTALLING_DEPS',
        `Installing ${depNames.length} ${depNames.length === 1 ? 'dependency' : 'dependencies'}...`,
      )

      const installResult = await sandbox.exec(
        'npm install --omit=dev --ignore-scripts --no-audit --no-fund',
        { cwd: '/workspace', timeout: 60_000 },
      )
      if (signal?.aborted) return 'cancelled'
      if (!installResult.success) return { error: redactSensitive(installResult.stderr) }
      onProgress?.('INSTALLING_DEPS', 'Dependencies installed')
    }
    return { entryPath, wranglerConfig }
  }

  async build(
    bundle: GeneratedBundle,
    options: BuildOptions,
    onProgress?: (stage: string, message: string) => void,
    control?: { signal?: AbortSignal },
  ): Promise<WorkerBuild> {
    const name = workerName(options.workflowId)
    // Before the sandbox exists: a name with no letters or digits rejects, as it always did.
    const className = options.className ?? workflowClassName(options.workflowName)
    const signal = control?.signal
    if (signal?.aborted) throw new DeployCancelledError()
    const sandboxId = sandboxIdFor('build')
    return this.inSandbox(sandboxId, signal, async (sandbox) => {
      try {
        const staged = await this.stage(sandbox, bundle, options, className, onProgress, signal)
        if (staged === 'cancelled') throw new DeployCancelledError()
        if ('error' in staged) throw new Error(staged.error)

        // No containment check here, unlike the Node build: the container is
        // the boundary. User code can bundle any file of the image, so a build
        // container must never hold a secret — none is written or passed in.
        onProgress?.('BUILDING', 'Building worker...')
        const built = await sandbox.exec(
          `wrangler deploy --dry-run --outdir ${BUILD_DIR} --metafile ${METAFILE}`,
          { cwd: '/workspace', timeout: 120_000 },
        )
        if (signal?.aborted) throw new DeployCancelledError()
        if (!built.success) throw new Error(redactSensitive(built.stderr))

        const mainModule = bundledEntry(await readText(sandbox, METAFILE))
        const listed = await sandbox.exec(`find ${BUILD_DIR} -type f`, { cwd: '/workspace' })
        if (signal?.aborted) throw new DeployCancelledError()
        if (!listed.success) throw new Error(redactSensitive(listed.stderr))
        const names = (listed.stdout as string)
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith(`${BUILD_DIR}/`))
          .map((line) => line.slice(BUILD_DIR.length + 1))
          .filter((file) => file !== mainModule && attachedModuleType(file) !== null)
          .sort()

        const modules: WorkerBuildModule[] = [
          {
            name: mainModule,
            type: 'esm',
            content: await readBytes(sandbox, `${BUILD_DIR}/${mainModule}`),
          },
        ]
        for (const file of names) {
          if (signal?.aborted) throw new DeployCancelledError()
          modules.push({
            name: file,
            type: attachedModuleType(file)!,
            content: await readBytes(sandbox, `${BUILD_DIR}/${file}`),
          })
        }
        return {
          workerName: name,
          mainModule,
          modules,
          wranglerConfig: JSON.parse(staged.wranglerConfig) as Record<string, unknown>,
        }
      } catch (err) {
        // A step cut short by the cancel's destroy fails; that is the cancel.
        if (err instanceof DeployCancelledError || signal?.aborted) {
          throw new DeployCancelledError()
        }
        // eslint-disable-next-line preserve-caught-error -- the cause carries the unredacted output
        throw new Error(redactSensitive((err as Error).message))
      }
    })
  }

  async deploy(
    bundle: GeneratedBundle,
    options: DeployOptions,
    onProgress?: (stage: string, message: string) => void,
    control?: DeployControl,
  ): Promise<WranglerDeployResult> {
    const name = workerName(options.workflowId)
    // Before the sandbox exists: a name with no letters or digits rejects, as it always did.
    const className = options.className ?? workflowClassName(options.workflowName)
    const signal = control?.signal
    const cancelled: WranglerDeployResult = { success: false, workerName: name, cancelled: true }
    if (signal?.aborted) return cancelled
    const sandboxId = sandboxIdFor('deploy')

    return this.inSandbox(sandboxId, signal, async (sandbox, keepRunning) => {
      try {
        // Path checks run inside the try so an invalid path still returns a
        // WranglerDeployResult instead of escaping as an exception.
        const staged = await this.stage(sandbox, bundle, options, className, onProgress, signal)
        if (staged === 'cancelled') return cancelled
        if ('error' in staged) return { success: false, workerName: name, error: staged.error }

        // 4. Attach secrets to the same upload. A separate `wrangler secret
        // bulk` creates a second version and a second deployment.
        const bulk = buildSecretsBulkJson(options.secrets)
        for (const skippedKey of bulk.skipped) {
          onProgress?.('UPLOADING_SECRETS', `Skipping invalid secret key "${skippedKey}"`)
        }
        if (bulk.json) {
          onProgress?.(
            'UPLOADING_SECRETS',
            `Uploading ${bulk.valid.length} ${bulk.valid.length === 1 ? 'secret' : 'secrets'}...`,
          )
          await sandbox.writeFile(`/workspace/${SECRETS_BULK_FILENAME}`, bulk.json)
        }

        // The last point a cancel can stop it. Past here the upload runs to its
        // end: stopping it halfway could leave a new version live.
        if (signal?.aborted) return cancelled
        if (control?.beforeUpload && !(await control.beforeUpload())) return cancelled
        keepRunning()

        // 5. Deploy with wrangler
        onProgress?.('DEPLOYING', 'Uploading worker to Cloudflare...')
        const deployResult = await sandbox.exec(
          `wrangler deploy${bulk.json ? ` --secrets-file ${SECRETS_BULK_FILENAME}` : ''}`,
          {
            cwd: '/workspace',
            timeout: 120_000,
            env: {
              CLOUDFLARE_ACCOUNT_ID: options.accountId,
              CLOUDFLARE_API_TOKEN: options.apiToken,
            },
            stream: true,
            onOutput: (_stream: string, data: string) => {
              const trimmed = withoutWorkerUrl(data.trim())
              if (trimmed) onProgress?.('DEPLOYING', trimmed)
            },
          },
        )

        if (!deployResult.success) {
          return { success: false, workerName: name, error: redactSensitive(deployResult.stderr) }
        }

        // 6. The URL AwaitStep calls it at
        const workerUrl = deployedWorkerUrl({
          stdout: deployResult.stdout,
          routes: options.routes,
          customDomains: options.customDomains,
        })
        return { success: true, workerName: name, workerUrl }
      } catch (err) {
        // A step cut short by the cancel's destroy fails; that is the cancel.
        if (signal?.aborted) return cancelled
        return { success: false, workerName: name, error: redactSensitive((err as Error).message) }
      }
    })
  }

  async deleteWorker(
    workerNameToDelete: string,
    options: { accountId: string; apiToken: string },
  ): Promise<{ success: boolean; error?: string }> {
    const sandboxId = sandboxIdFor('delete')
    const sandbox = this.getSandbox(sandboxId)
    try {
      const result = await sandbox.exec(`wrangler delete --name ${workerNameToDelete} --force`, {
        cwd: '/workspace',
        env: {
          CLOUDFLARE_ACCOUNT_ID: options.accountId,
          CLOUDFLARE_API_TOKEN: options.apiToken,
        },
        timeout: 60_000,
      })
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
