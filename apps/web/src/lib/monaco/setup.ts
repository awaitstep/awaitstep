import type { Monaco } from '@monaco-editor/react'
import { AWAITSTEP_MODULES_DTS } from './awaitstep-modules'
import { remeasureWhenCodeFontLoads } from './code-font'
import { CF_RUNTIME_DTS } from './cf-runtime-dts'
import type { LanguageHosts } from './project-libs'
import { defineAwaitstepThemes } from './theme'

/**
 * Diagnostics stay ON (v1 disabled them wholesale); these codes are muted
 * because AwaitStep's trigger-code grammar is not plain TypeScript:
 * - 1108: `return` at top level — legacy no-annotation mode treats the whole
 *   file as the fetch body.
 * - 1206/1434: `@fetch` / `@queue` / `@config` handler annotations parse as
 *   misplaced decorators.
 * - 2307: imports of npm packages installed at deploy time can't resolve in
 *   the browser. The code workspace lifts this one once type acquisition
 *   has supplied (or stubbed) every package in view — see
 *   {@link setProjectDiagnostics}.
 */
export const MUTED_DIAGNOSTIC_CODES = [1108, 1206, 1434, 2307]

const UNRESOLVED_IMPORT_CODE = 2307

const CF_RUNTIME_LIB_URI = 'file:///awaitstep/cf-runtime.d.ts'
const AWAITSTEP_MODULES_LIB_URI = 'file:///awaitstep/awaitstep-modules.d.ts'

// Platform modules that only exist at runtime: `cloudflare:workers` has a
// real declaration above; everything else under those schemes resolves to
// `any` instead of "Cannot find module".
const PLATFORM_MODULES_DTS = "declare module 'node:*';\ndeclare module 'cloudflare:*';\n"
const PLATFORM_MODULES_LIB_URI = 'file:///awaitstep/platform-modules.d.ts'

let configured = false

/**
 * The options every editor shares. Project-specific ones (the `#app/` root
 * and a project tsconfig's switches) layer on top via
 * {@link setProjectCompilerOptions}.
 */
function baseCompilerOptions(ts: Monaco['languages']['typescript']) {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    // ts.ModuleResolutionKind.Bundler (numeric: monaco's typings lag the
    // enum) — what wrangler's esbuild does: package.json `exports` and
    // `imports` resolve, extensionless relative imports resolve.
    moduleResolution: 100,
    resolveJsonModule: true,
    allowJs: true,
    checkJs: false,
    strict: false,
    noEmit: true,
    allowNonTsExtensions: true,
    // ts.ModuleDetectionKind.Force (numeric: monaco's typings lag the enum):
    // every model is its own module, so import-less node snippets and entry
    // code never merge into one global scope and cross-report duplicate
    // identifiers. Ambient globals still come from the extra libs.
    moduleDetection: 3,
  }
}

/**
 * The single Monaco configuration: one compiler config, semantic + syntax
 * validation enabled, and the shared Cloudflare runtime ambient types.
 * Idempotent — safe as `beforeMount` on every editor, and every other
 * entry point in this module calls it first, so a workspace that layers
 * project options before its first editor mounts is never reset by that
 * mount. Per-workflow types layer on top via context-dts.ts.
 */
export function configureMonaco(monaco: Monaco): void {
  if (configured) return
  configured = true
  defineAwaitstepThemes(monaco)
  void remeasureWhenCodeFontLoads(monaco)

  const ts = monaco.languages.typescript
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setCompilerOptions(baseCompilerOptions(ts))
    defaults.setDiagnosticsOptions(diagnosticsOptions(false))
    defaults.setEagerModelSync(true)
    defaults.addExtraLib(CF_RUNTIME_DTS, CF_RUNTIME_LIB_URI)
    defaults.addExtraLib(AWAITSTEP_MODULES_DTS, AWAITSTEP_MODULES_LIB_URI)
    defaults.addExtraLib(PLATFORM_MODULES_DTS, PLATFORM_MODULES_LIB_URI)
  }
}

function diagnosticsOptions(reportUnresolvedImports: boolean) {
  return {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: reportUnresolvedImports
      ? MUTED_DIAGNOSTIC_CODES.filter((code) => code !== UNRESOLVED_IMPORT_CODE)
      : MUTED_DIAGNOSTIC_CODES,
  }
}

/**
 * Whether "Cannot find module" is reported. The code workspace turns it on
 * once type acquisition has handled every package in view, so a typo in an
 * `#app/` or relative import is an error while npm packages are never a
 * flash of red; `null` restores the shared default (muted) for the canvas.
 */
export function setProjectDiagnostics(
  monaco: Monaco,
  project: { reportUnresolvedImports: boolean } | null,
): void {
  configureMonaco(monaco)
  const ts = monaco.languages.typescript
  const options = diagnosticsOptions(project?.reportUnresolvedImports ?? false)
  ts.typescriptDefaults.setDiagnosticsOptions(options)
  ts.javascriptDefaults.setDiagnosticsOptions(options)
}

/** The two language services (each mirrors only its own language's models) as extra-lib hosts. */
export function languageHosts(monaco: Monaco): LanguageHosts {
  configureMonaco(monaco)
  const ts = monaco.languages.typescript
  return { typescript: ts.typescriptDefaults, javascript: ts.javascriptDefaults }
}

/**
 * Lays a project's options over the shared ones: the workflow root (so
 * `#app/*` and relative imports resolve across its models) and whatever its
 * tsconfig.json may switch on. `null` restores the shared options — the
 * canvas's editors share these defaults and must not inherit a root.
 * Monaco replaces the whole options object, so the base is always re-applied.
 */
export function setProjectCompilerOptions(
  monaco: Monaco,
  project: Record<string, unknown> | null,
): void {
  configureMonaco(monaco)
  const ts = monaco.languages.typescript
  const options = { ...baseCompilerOptions(ts), ...project }
  ts.typescriptDefaults.setCompilerOptions(options)
  ts.javascriptDefaults.setCompilerOptions(options)
}

/**
 * Stable model URI for a workflow file, so every editor pane bound to the
 * same logical file shares one Monaco model (undo stack, markers, state).
 */
export function workflowModelPath(workflowId: string, file: string): string {
  return `${MODEL_PATH_PREFIX}${encodeURIComponent(workflowId)}/${file}`
}

const MODEL_PATH_PREFIX = 'awaitstep://workflow/'

/**
 * Inverse of {@link workflowModelPath} for URIs Monaco hands back (markers,
 * model lists). Null for anything that is not a workflow file model.
 */
export function parseWorkflowModelPath(uri: string): { workflowId: string; file: string } | null {
  if (!uri.startsWith(MODEL_PATH_PREFIX)) return null
  const rest = uri.slice(MODEL_PATH_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return null
  try {
    return {
      workflowId: decodeURIComponent(rest.slice(0, slash)),
      file: decodeURIComponent(rest.slice(slash + 1)),
    }
  } catch {
    return null
  }
}
