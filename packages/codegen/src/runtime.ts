import type { GeneratedFile } from './types.js'

/**
 * The import prefix every generated bundle uses for AwaitStep runtime modules.
 *
 * - `#awaitstep/runtime` is the provider-neutral authoring surface.
 * - `#awaitstep/<provider>` is a provider-scoped primitive (for example
 *   `#awaitstep/cloudflare`). Importing one means the workflow requires that
 *   provider; the deploy check refuses a different target before generation.
 *
 * The worker's `package.json` `imports` map makes both resolve at deploy, and
 * the browser IDE mirrors the map through its compiler `paths`.
 */
export const AWAITSTEP_IMPORT_PREFIX = '#awaitstep/'

/** The core runtime module, emitted into every workflow bundle. */
export const CORE_RUNTIME_IMPORT = `${AWAITSTEP_IMPORT_PREFIX}runtime`

/** Bundle directory the emitted runtime modules live in. */
export const AWAITSTEP_MODULE_DIR = 'awaitstep/'

/**
 * The generated graph modules a project file may import beside the runtime:
 * `#awaitstep/workflow` (a workflow's module, with `startWorkflow`,
 * `workflowStatus`, `getInstance`, `sendEvent` and `AWAITSTEP_RETENTION`) and `#awaitstep/function` (a
 * function's `runGraph` and `Env`). Neither names a provider.
 */
export const GENERATED_GRAPH_MODULES: ReadonlySet<string> = new Set(['workflow', 'function'])

/** Bundle path of the emitted core runtime module. */
export const RUNTIME_MODULE_PATH = `${AWAITSTEP_MODULE_DIR}runtime.ts`

/** Bundle path of a function's generated graph module. */
export const FUNCTION_MODULE_PATH = `${AWAITSTEP_MODULE_DIR}function.ts`

/**
 * The `package.json` `imports` entry that resolves `#awaitstep/*` in the deploy
 * directory. Compiled module paths are `.js` by the time the worker runs.
 */
export const AWAITSTEP_IMPORTS_FIELD: Readonly<Record<string, string>> = {
  [`${AWAITSTEP_IMPORT_PREFIX}*`]: `./${AWAITSTEP_MODULE_DIR}*.js`,
}

/** The `#awaitstep/runtime` pass-through generated code calls a step module through. */
export const STEP_ARGS = 'stepArgs'

/** The `#awaitstep/runtime` import of the names a generated module uses. */
export function runtimeImport(names: readonly string[]): string {
  return `import { ${names.join(', ')} } from "${CORE_RUNTIME_IMPORT}";`
}

/** Whether generated code calls a step module, which it does through {@link STEP_ARGS}. */
export function callsStepModules(files: readonly GeneratedFile[]): boolean {
  return files.some((file) => file.role === 'module' && file.binding !== undefined)
}

/** The runtime import a portable workflow module needs. */
export function workflowRuntimeImport(options: {
  callsStepModules: boolean
  hasWait: boolean
}): string {
  return runtimeImport([
    'defineWorkflow',
    'durableStep',
    ...(options.callsStepModules ? [STEP_ARGS] : []),
    ...(options.hasWait ? ['waitForEventOrTimeout'] : []),
  ])
}

/**
 * The runtime import a function's graph module needs. A context that only
 * makes HTTP calls needs no host and no step adapter; a sub call needs the
 * platform adapter's type.
 */
export function functionRuntimeImport(options: {
  needsHost: boolean
  hasSubCalls: boolean
  callsStepModules: boolean
}): string {
  if (!options.needsHost) return runtimeImport(['createWorkflowContext'])
  return runtimeImport([
    'createInlineHost',
    'createWorkflowContext',
    ...(options.callsStepModules ? [STEP_ARGS] : []),
    ...(options.hasSubCalls ? ['type PlatformHost'] : []),
  ])
}
