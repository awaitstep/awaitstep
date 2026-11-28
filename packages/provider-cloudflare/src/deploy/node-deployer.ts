import { writeFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { assertSafeBundlePath, bundleDeployFiles, bundlePackageManifest } from '@awaitstep/codegen'
import type { GeneratedBundle } from '@awaitstep/codegen'
import type {
  BuildOptions,
  DeployControl,
  WranglerDeployer,
  DeployOptions,
  WorkerBuild,
  WranglerDeployResult,
} from './deployer.js'
import { buildSecretsBulkJson, redactSensitive, SECRETS_BULK_FILENAME } from './deployer.js'
import { readBuildModules } from './build-modules.js'
import { DeployCancelledError, runToEnd, throwIfCancelled } from './run-to-end.js'
import { DEFAULT_WORKER_PACKAGE_NAME, buildWorkerPackageJson } from './package-manifest.js'
import { generateWranglerConfig } from '../wrangler-config.js'
import { workerName, workflowClassName, sanitizedWorkflowName } from '../naming.js'
import { wranglerCommand, wranglerEnv } from '../wrangler-exec.js'
import { prepareHostDeploy } from '../dev-workspace.js'
import { deployedWorkerUrl } from './worker-url.js'

const execFileAsync = promisify(execFile)

/** A deploy's workspace, written, installed and built — everything before the upload. */
interface Staged {
  /** The project directory wrangler runs in: code, wrangler.json, package.json. */
  deployDir: string
  /** The checked build, beside the project. */
  buildDir: string
  /** The bundled entry inside `buildDir`. */
  builtEntry: string
  wranglerConfig: string
}

function workspaceDirs(root: string): { deployDir: string; buildDir: string } {
  // Unguessable and unique per call: two deploys or builds in the same
  // millisecond must never share a workspace, and both are made without
  // `recursive`, so a path that already exists (planted or not) fails closed.
  const deployDir = join(root, `awaitstep-deploy-${Date.now()}-${randomUUID()}`)
  // Beside the project, not inside it: the checked build is what uploads.
  return { deployDir, buildDir: `${deployDir}-build` }
}

async function removeWorkspace(dirs: { deployDir: string; buildDir: string }): Promise<void> {
  await rm(dirs.deployDir, { recursive: true, force: true }).catch(() => {})
  await rm(dirs.buildDir, { recursive: true, force: true }).catch(() => {})
}

/**
 * Writes the bundle, wrangler.json and package.json into `deployDir`, installs
 * the dependencies, and builds into `buildDir` with the containment check.
 * Shared by `deploy` and `build`, so a build is exactly what a deploy uploads.
 */
async function stage(
  bundle: GeneratedBundle,
  options: BuildOptions,
  className: string,
  dirs: { deployDir: string; buildDir: string },
  onProgress: ((stage: string, message: string) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<Staged> {
  const { deployDir, buildDir } = dirs
  const name = workerName(options.workflowId)

  throwIfCancelled(signal)
  await mkdir(deployDir)

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
      libraryModules: bundle.libraryModules,
    }),
    'utf-8',
  )
  // Install, build, and prove the build reads nothing outside the
  // directory — then upload that build, not a second one.
  await mkdir(buildDir)
  const builtEntry = await prepareHostDeploy(
    deployDir,
    options.dependencies,
    buildDir,
    onProgress,
    signal,
  )
  return { deployDir, buildDir, builtEntry, wranglerConfig }
}

export class NodeWranglerDeployer implements WranglerDeployer {
  /** `workRoot`: where each deploy's and build's workspace is made; the system temp directory by default. */
  constructor(private readonly options: { workRoot?: string } = {}) {}

  async build(
    bundle: GeneratedBundle,
    options: BuildOptions,
    onProgress?: (stage: string, message: string) => void,
    control?: { signal?: AbortSignal },
  ): Promise<WorkerBuild> {
    const name = workerName(options.workflowId)
    // Before the workspace exists: a name with no letters or digits rejects, as it always did.
    const className = options.className ?? workflowClassName(options.workflowName)
    const dirs = workspaceDirs(this.options.workRoot ?? tmpdir())
    try {
      const staged = await stage(bundle, options, className, dirs, onProgress, control?.signal)
      const { mainModule, modules } = await readBuildModules(staged.buildDir, staged.builtEntry)
      return {
        workerName: name,
        mainModule,
        modules,
        wranglerConfig: JSON.parse(staged.wranglerConfig) as Record<string, unknown>,
      }
    } catch (err) {
      if (err instanceof DeployCancelledError) throw err
      const error = err as Error & { stderr?: string }
      // Redacted, and without the cause: a build's output is shown to the user.
      // eslint-disable-next-line preserve-caught-error -- the cause carries the unredacted output
      throw new Error(redactSensitive(error.stderr ? error.stderr : error.message))
    } finally {
      await removeWorkspace(dirs)
    }
  }

  async deploy(
    bundle: GeneratedBundle,
    options: DeployOptions,
    onProgress?: (stage: string, message: string) => void,
    control?: DeployControl,
  ): Promise<WranglerDeployResult> {
    const name = workerName(options.workflowId)
    // Before the workspace exists: a name with no letters or digits rejects, as it always did.
    const className = options.className ?? workflowClassName(options.workflowName)
    const dirs = workspaceDirs(this.options.workRoot ?? tmpdir())
    const signal = control?.signal

    try {
      const { deployDir, builtEntry } = await stage(
        bundle,
        options,
        className,
        dirs,
        onProgress,
        signal,
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

      // The last point a cancel can stop it. Past here the upload runs to its
      // end: stopping it halfway could leave a new version live.
      throwIfCancelled(signal)
      if (control?.beforeUpload && !(await control.beforeUpload())) {
        return { success: false, workerName: name, cancelled: true }
      }

      onProgress?.('DEPLOYING', 'Uploading worker to Cloudflare...')
      const wrangler = wranglerCommand()
      // `-c` because a script argument otherwise makes wrangler look for a
      // config beside the script — and deploy without bindings.
      const { stdout } = await runToEnd(
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
        {
          cwd: deployDir,
          env: deployEnv,
          timeout: 120_000,
          label: 'wrangler deploy',
          // An upload is never cut short, by a cancel or by the API exiting:
          // stopped halfway it could leave a version partly live.
          killOnExit: false,
        },
      )

      // 6. The URL AwaitStep calls it at
      const workerUrl = deployedWorkerUrl({
        stdout,
        routes: options.routes,
        customDomains: options.customDomains,
      })
      return { success: true, workerName: name, workerUrl }
    } catch (err) {
      if (err instanceof DeployCancelledError) {
        return { success: false, workerName: name, cancelled: true }
      }
      const error = err as Error & { stderr?: string }
      const safeError = error.stderr
        ? redactSensitive(error.stderr)
        : redactSensitive(error.message)
      return { success: false, workerName: name, error: safeError }
    } finally {
      await removeWorkspace(dirs)
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
