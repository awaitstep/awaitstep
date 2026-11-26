import type { Monaco } from '@monaco-editor/react'
import { AWAITSTEP_MODULES_DTS } from './awaitstep-modules'
import { remeasureWhenCodeFontLoads } from './code-font'
import { keepKeysInEditors } from './key-isolation'
import type { LanguageHosts } from './project-libs'
import { defineAwaitstepThemes } from './theme'
import { EDITOR_LIB } from './editor-lib'

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
 *   {@link setProjectDiagnostics}; the canvas keeps it muted.
 */
export const MUTED_DIAGNOSTIC_CODES = [1108, 1206, 1434, 2307]

const UNRESOLVED_IMPORT_CODE = 2307

const AWAITSTEP_MODULES_LIB_URI = 'file:///awaitstep/awaitstep-modules.d.ts'

// Node built-ins have no browser declarations; a provider pack adds its own
// runtime scheme (e.g. `cloudflare:*`) only when the project uses it.
const PLATFORM_MODULES_DTS = "declare module 'node:*';\n"
const PLATFORM_MODULES_LIB_URI = 'file:///awaitstep/platform-modules.d.ts'

// Numeric, not `ScriptTarget.ES2022` / `ModuleKind.ESNext`: Monaco's
// ScriptTarget enum stops at ES2020, so `ES2022` is undefined at runtime and
// the worker silently falls back to the ES2015 lib (`Object.entries` and
// every later API become errors). The worker picks
// `lib.es${2013 + target}.full.d.ts`, so 9 is ES2022.
const ES2022_TARGET = 9
const ESNEXT_MODULE = 99

let configured = false

/**
 * The options every editor shares. Project-specific ones (the `#app/` root
 * and a project tsconfig's switches) layer on top via
 * {@link setProjectCompilerOptions}.
 */
function baseCompilerOptions() {
  return {
    target: ES2022_TARGET,
    lib: [...EDITOR_LIB],
    module: ESNEXT_MODULE,
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

/** The Monaco instance the editors run on, once one has mounted (see `liveErrorCount`). */
let loadedMonaco: Monaco | null = null

export function loadedMonacoInstance(): Monaco | null {
  return loadedMonaco
}

/**
 * The single Monaco configuration: one compiler config, semantic + syntax
 * validation enabled, and the provider-neutral AwaitStep module types.
 * Provider runtime types layer on top via provider-types.ts only when the
 * project uses that provider's syntax. Idempotent — safe as `beforeMount`
 * on every editor, and every other entry point in this module calls it
 * first, so a workspace that layers project options before its first editor
 * mounts is never reset by that mount. Per-workflow types layer on top via
 * context-dts.ts.
 */
export function configureMonaco(monaco: Monaco): void {
  loadedMonaco = monaco
  keepKeysInEditors(monaco)
  if (configured) return
  configured = true
  defineAwaitstepThemes(monaco)
  void remeasureWhenCodeFontLoads(monaco)

  const ts = monaco.typescript
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setCompilerOptions(baseCompilerOptions())
    defaults.setDiagnosticsOptions(diagnosticsOptions(false))
    defaults.setEagerModelSync(true)
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
  const ts = monaco.typescript
  const options = diagnosticsOptions(project?.reportUnresolvedImports ?? false)
  ts.typescriptDefaults.setDiagnosticsOptions(options)
  ts.javascriptDefaults.setDiagnosticsOptions(options)
}

/**
 * Re-checks every model. Monaco checks a model when it is added and when it
 * changes, never the models that import it: an importer keeps "Cannot find
 * module" after the module's files arrive, and keeps none after they go.
 * Re-applying the diagnostics options is Monaco's own signal to re-check all.
 */
export function revalidateModels(monaco: Monaco): void {
  const ts = monaco.typescript
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setDiagnosticsOptions(defaults.getDiagnosticsOptions())
  }
}

/** The two language services (each mirrors only its own language's models) as extra-lib hosts. */
export function languageHosts(monaco: Monaco): LanguageHosts {
  configureMonaco(monaco)
  const ts = monaco.typescript
  return { typescript: ts.typescriptDefaults, javascript: ts.javascriptDefaults }
}

/**
 * Lays a project's options over the shared ones: the workflow root (so
 * `#app/*` and relative imports resolve across its models) and whatever its
 * tsconfig.json may switch on. Both surfaces install a root for the workflow
 * they show (`useProjectLanguageService`); `null` restores the shared
 * options when one unmounts, so the next never inherits another workflow's
 * root. Monaco replaces the whole options object, so the base is always re-applied.
 */
export function setProjectCompilerOptions(
  monaco: Monaco,
  project: Record<string, unknown> | null,
): void {
  configureMonaco(monaco)
  const ts = monaco.typescript
  const options = { ...baseCompilerOptions(), ...project }
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
