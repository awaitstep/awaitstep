import type { Monaco } from '@monaco-editor/react'
import { CF_RUNTIME_DTS } from './cf-runtime-dts'

/**
 * Diagnostics stay ON (v1 disabled them wholesale); these codes are muted
 * because AwaitStep's trigger-code grammar is not plain TypeScript:
 * - 1108: `return` at top level — legacy no-annotation mode treats the whole
 *   file as the fetch body.
 * - 1206/1434: `@fetch` / `@queue` / `@config` handler annotations parse as
 *   misplaced decorators.
 * - 2307: imports of npm packages installed at deploy time can't resolve in
 *   the browser (type acquisition is a later stage).
 */
export const MUTED_DIAGNOSTIC_CODES = [1108, 1206, 1434, 2307]

const CF_RUNTIME_LIB_URI = 'file:///awaitstep/cf-runtime.d.ts'

let configured = false

/**
 * The single Monaco configuration: one compiler config, semantic + syntax
 * validation enabled, and the shared Cloudflare runtime ambient types.
 * Idempotent — safe as `beforeMount` on every editor. Per-workflow types
 * layer on top via context-dts.ts.
 */
export function configureMonaco(monaco: Monaco): void {
  if (configured) return
  configured = true

  const ts = monaco.languages.typescript
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
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
  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: MUTED_DIAGNOSTIC_CODES,
  }

  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setCompilerOptions(compilerOptions)
    defaults.setDiagnosticsOptions(diagnosticsOptions)
    defaults.setEagerModelSync(true)
    defaults.addExtraLib(CF_RUNTIME_DTS, CF_RUNTIME_LIB_URI)
  }
}

/**
 * Stable model URI for a workflow file, so every editor pane bound to the
 * same logical file shares one Monaco model (undo stack, markers, state).
 */
export function workflowModelPath(workflowId: string, file: string): string {
  return `awaitstep://workflow/${encodeURIComponent(workflowId)}/${file}`
}
