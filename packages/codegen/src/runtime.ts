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
 * `workflowStatus` and `AWAITSTEP_RETENTION`) and `#awaitstep/function` (a
 * function's `runGraph` and `Env`). Neither names a provider.
 */
export const GENERATED_GRAPH_MODULES: ReadonlySet<string> = new Set(['workflow', 'function'])

/** Bundle path of the emitted core runtime module. */
export const RUNTIME_MODULE_PATH = `${AWAITSTEP_MODULE_DIR}runtime.ts`

/** Provider-scoped primitives, by provider id (only Cloudflare today). */
export const PROVIDER_PRIMITIVE_IMPORTS: Readonly<Record<string, string>> = {
  cloudflare: `${AWAITSTEP_IMPORT_PREFIX}cloudflare`,
}

/**
 * The `package.json` `imports` entry that resolves `#awaitstep/*` in the deploy
 * directory. Compiled module paths are `.js` by the time the worker runs.
 */
export const AWAITSTEP_IMPORTS_FIELD: Readonly<Record<string, string>> = {
  [`${AWAITSTEP_IMPORT_PREFIX}*`]: `./${AWAITSTEP_MODULE_DIR}*.js`,
}
