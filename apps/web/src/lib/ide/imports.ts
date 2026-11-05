import { importSpecifiers as scanSpecifiers, withoutComments } from '@awaitstep/codegen'
import { PROJECT_IMPORT_PREFIX, fileExtension, projectImportCandidates } from '@awaitstep/ir'
import { dirname } from './file-tree'

const CACHE_LIMIT = 400
const specifierCache = new Map<string, readonly string[]>()

/**
 * A short stand-in for a source, so the cache holds a few bytes per file
 * instead of the file: length plus two independent 32-bit hashes.
 */
export function sourceKey(source: string): string {
  let fnv = 0x811c9dc5
  let djb = 5381
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i)
    fnv = Math.imul(fnv ^ code, 0x01000193)
    djb = (Math.imul(djb, 33) + code) | 0
  }
  return `${source.length}:${(fnv >>> 0).toString(36)}:${(djb >>> 0).toString(36)}`
}

/**
 * Every module specifier a source file imports, in the order it appears:
 * `from '…'`, side-effect `import '…'`, dynamic `import('…')` and `require('…')`.
 *
 * It reads code the way the deploy does (the codegen package's scanner, with
 * comments removed first), so an import commented out is not counted.
 * Type-only imports are left out for the same reason the deploy leaves them
 * out: they vanish from the bundle.
 */
export function importSpecifiers(source: string): readonly string[] {
  const key = sourceKey(source)
  const cached = specifierCache.get(key)
  if (cached) return cached
  const found = scanSpecifiers(withoutComments(source))
  // Oldest entries go first; a Map iterates in insertion order.
  if (specifierCache.size >= CACHE_LIMIT) {
    const oldest = specifierCache.keys().next().value
    if (oldest !== undefined) specifierCache.delete(oldest)
  }
  specifierCache.set(key, found)
  return found
}

/** The path with `.` and `..` folded away, or null when it climbs above the root. */
function normalize(segmentsIn: readonly string[]): string | null {
  const segments: string[] = []
  for (const part of segmentsIn) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (segments.length === 0) return null
      segments.pop()
    } else {
      segments.push(part)
    }
  }
  return segments.join('/')
}

/** What a bundler tries for a relative import, which (unlike `#app/`) finds a folder's index. */
function relativeCandidates(base: string): string[] {
  const withoutExtension = /\.(?:ts|js|mts|mjs|cts|cjs)$/.test(base)
    ? base.slice(0, -(fileExtension(base).length + 1))
    : base
  return [
    base,
    ...projectImportCandidates(base),
    `${withoutExtension}.ts`,
    `${withoutExtension}.js`,
    `${base}/index.ts`,
    `${base}/index.js`,
  ]
}

/**
 * The project file a specifier points at, or null when it is a package, a
 * generated module, or a file that does not exist. `#app/…` follows the same
 * mapping the deploy carries (a bare folder is not its index file); relative
 * specifiers are resolved against the importer the way a bundler would.
 */
export function resolveProjectImport(
  specifier: string,
  importerPath: string,
  projectPaths: ReadonlySet<string>,
): string | null {
  if (specifier.startsWith(PROJECT_IMPORT_PREFIX)) {
    const target = normalize(specifier.slice(PROJECT_IMPORT_PREFIX.length).split('/'))
    if (!target) return null
    return projectImportCandidates(target).find((c) => projectPaths.has(c)) ?? null
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const base = normalize([...dirname(importerPath).split('/'), ...specifier.split('/')])
    if (!base) return null
    return relativeCandidates(base).find((c) => projectPaths.has(c)) ?? null
  }
  return null
}

/** The project files `source` imports, each once, in the order they appear. */
export function projectImports(
  source: string,
  importerPath: string,
  projectPaths: ReadonlySet<string>,
): string[] {
  const resolved: string[] = []
  for (const specifier of importSpecifiers(source)) {
    const path = resolveProjectImport(specifier, importerPath, projectPaths)
    if (path !== null && path !== importerPath && !resolved.includes(path)) resolved.push(path)
  }
  return resolved
}
