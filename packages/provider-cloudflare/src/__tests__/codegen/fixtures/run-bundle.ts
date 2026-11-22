import ts from 'typescript'
import type { GeneratedBundle } from '@awaitstep/codegen'

/** `NonRetryableError` as `cloudflare:workflows` exports it, for generated code run in a test. */
export class NonRetryableError extends Error {
  override readonly name = 'NonRetryableError'
}

/** The `cloudflare:*` modules generated code imports, reduced to what a test exercises. */
const CLOUDFLARE_MODULES: Record<string, Record<string, unknown>> = {
  'cloudflare:workers': { WorkflowEntrypoint: class {} },
  'cloudflare:workflows': { NonRetryableError },
}

/**
 * Runs one file of a generated bundle and returns its exports. Its imports
 * resolve to the bundle's own files (`#awaitstep/*`, `#app/*`, relative
 * paths) — the real runtime included — and `cloudflare:*` to small stubs.
 */
export function loadBundleModule(
  bundle: GeneratedBundle,
  path: string,
): Record<string, unknown> & { default?: unknown } {
  const sources = new Map(bundle.files.map((file) => [file.path, file.source]))
  const cache = new Map<string, Record<string, unknown>>()

  const resolve = (from: string, specifier: string): string => {
    const base = specifier.startsWith('#awaitstep/')
      ? `awaitstep/${specifier.slice('#awaitstep/'.length)}`
      : specifier.startsWith('#app/')
        ? specifier.slice('#app/'.length)
        : specifier.startsWith('.')
          ? new URL(specifier, `file:///${from}`).pathname.slice(1)
          : specifier
    const stem = base.replace(/\.js$/, '')
    for (const candidate of [stem, `${stem}.ts`, `${stem}/index.ts`]) {
      if (sources.has(candidate)) return candidate
    }
    throw new Error(`${from} imports "${specifier}", which the bundle doesn't have`)
  }

  const load = (file: string): Record<string, unknown> => {
    const cached = cache.get(file)
    if (cached) return cached
    const exports: Record<string, unknown> = {}
    cache.set(file, exports)
    const js = ts.transpileModule(sources.get(file)!, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const requireFrom = (specifier: string): unknown =>
      CLOUDFLARE_MODULES[specifier] ?? load(resolve(file, specifier))
    new Function('exports', 'require', js)(exports, requireFrom)
    return exports
  }

  return load(path)
}
