import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  assertSafeBundlePath,
  bundleCodeFiles,
  bundleDeployFiles,
  bundleEntry,
  bundlePackageManifest,
} from '@awaitstep/codegen'
import type { GeneratedBundle, LocalDevOptions } from '@awaitstep/codegen'
import type { WorkflowIR } from '@awaitstep/ir'
import { assertRegistryDependencies } from '@awaitstep/ir'
import { compileBundle } from './compile-bundle.js'
import { detectBindings, detectBindingsFromSource } from './codegen/bindings.js'
import { getSubScriptBindings } from './codegen/generators/sub-script.js'
import { getSubWorkflowBindings } from './codegen/generators/sub-workflow.js'
import { generateWranglerConfig } from './wrangler-config.js'
import { workerName, workflowClassName, sanitizedWorkflowName } from './naming.js'
import { buildWorkerPackageJson, hasDependencies } from './deploy/package-manifest.js'

const execFileAsync = promisify(execFile)

const INSTALL_TIMEOUT_MS = 60_000
const SECRET_FILE_MODE = 0o600
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const WORKFLOW_CLASS = /export\s+class\s+(\w+)\s+extends\s+WorkflowEntrypoint/

export interface DevWorkspaceFile {
  path: string
  content: string
  /** Written with owner-only permissions where the filesystem allows it. */
  secret?: boolean
}

/**
 * Everything a bundle needs on disk to run under `wrangler dev`, as plain
 * values: compiled code, a wrangler config, the package manifest and any
 * secrets.
 *
 * One builder for local dev, node test sessions and container test sessions.
 * They write files to different places — a directory, a container — but the
 * contents must not differ, and when they were built separately they drifted:
 * the container copy was missing sub-workflow and Call Script bindings, so
 * those steps threw in a test session while working when deployed.
 *
 * The config is derived the same way the deploy derives it, including the
 * class name read out of the generated entry rather than guessed from the
 * workflow's name.
 */
export async function buildDevWorkspaceFiles(
  bundle: GeneratedBundle,
  options: LocalDevOptions,
): Promise<DevWorkspaceFile[]> {
  // Compiled here so no caller can forget: `.ts` on disk leaves `#app/worker`
  // unresolvable and every handler-module workflow fails to start.
  const compiled = await compileBundle(bundle)
  const files: DevWorkspaceFile[] = bundleDeployFiles(compiled).map((file) => ({
    path: assertSafeBundlePath(file.path),
    content: file.compiled ?? file.source,
  }))

  const ir = options.ir as WorkflowIR | undefined
  // Same authority as the deploy path: declared bindings from the IR when
  // available, source regex scanning only as the legacy fallback.
  const bindings = ir
    ? detectBindings(ir)
    : detectBindingsFromSource(
        bundleCodeFiles(compiled)
          .map((file) => file.source)
          .join('\n'),
      )
  const subWorkflowBindings = ir ? getSubWorkflowBindings(ir.nodes) : []
  const subScriptBindings = ir ? getSubScriptBindings(ir.nodes) : []
  const isScript = options.kind === 'script'

  files.push({
    path: 'wrangler.json',
    content: generateWranglerConfig({
      kind: options.kind,
      workerName: workerName(options.workflowId),
      // Scripts have no `WorkflowEntrypoint` class — omit className/workflowName.
      ...(isScript
        ? {}
        : {
            className: generatedClassName(compiled) ?? workflowClassName(options.workflowName),
            workflowName: sanitizedWorkflowName(options.workflowName),
          }),
      main: `./${compiled.entry}`,
      vars: options.vars,
      bindings: bindings.length > 0 ? bindings : undefined,
      subWorkflowBindings: subWorkflowBindings.length > 0 ? subWorkflowBindings : undefined,
      subScriptBindings: subScriptBindings.length > 0 ? subScriptBindings : undefined,
      localDev: true,
    }),
  })

  files.push({
    path: 'package.json',
    content: buildWorkerPackageJson({
      name: workspaceName(options.workflowId),
      dependencies: options.dependencies,
      manifestSource: bundlePackageManifest(bundle),
    }),
  })

  const devVars = formatDevVars(options.secrets)
  if (devVars) files.push({ path: '.dev.vars', content: devVars, secret: true })

  return files
}

/**
 * Renders secrets as a `.dev.vars` file. Values are quoted and escaped:
 * unquoted, a PEM key is cut at its first newline, a `#` truncates the rest
 * of the value, and a newline in a value can declare another variable
 * entirely. Keys that are not valid identifiers are dropped rather than
 * written as something wrangler will mis-parse.
 */
export function formatDevVars(secrets: Record<string, string> | undefined): string {
  const lines = Object.entries(secrets ?? {})
    .filter(([key]) => ENV_KEY.test(key))
    .map(([key, value]) => `${key}="${escapeDevVarValue(value)}"`)
  return lines.join('\n')
}

function escapeDevVarValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
}

/** The class the generated entry actually exports, as the deploy reads it. */
function generatedClassName(bundle: GeneratedBundle): string | undefined {
  try {
    return bundleEntry(bundle).source.match(WORKFLOW_CLASS)?.[1]
  } catch {
    // A bundle without its entry is a generator bug; fall back to the name.
    return undefined
  }
}

function workspaceName(workflowId: string): string {
  return `awaitstep-dev-${workflowId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
}

/** Writes a built workspace to a directory. */
export async function writeDevWorkspace(
  dir: string,
  files: readonly DevWorkspaceFile[],
): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const file of files) {
    const target = join(dir, file.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, file.content, {
      encoding: 'utf-8',
      ...(file.secret && { mode: SECRET_FILE_MODE }),
    })
  }
}

/**
 * Installs the workspace's dependencies. The manifest is already written by
 * the builder — it carries the `#app/` import map even when there is nothing
 * to install.
 */
export async function installWorkspaceDependencies(
  dir: string,
  dependencies?: Record<string, string>,
): Promise<void> {
  if (!hasDependencies(dependencies)) return
  assertRegistryDependencies(dependencies)
  await execFileAsync(
    'npm',
    ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: dir, timeout: INSTALL_TIMEOUT_MS },
  )
}
