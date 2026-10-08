import type { GeneratedArtifact, GeneratedBundle, GeneratedFile } from './types.js'

/** Wraps a legacy single-file artifact in the bundle shape. */
export function toBundle(artifact: GeneratedArtifact): GeneratedBundle {
  const entry: GeneratedFile = {
    path: artifact.filename,
    source: artifact.source,
    ...(artifact.compiled !== undefined && { compiled: artifact.compiled }),
    role: 'entry',
  }
  return { entry: entry.path, files: [entry] }
}

/**
 * The bundle's entry file. Every valid bundle has exactly one — a missing
 * entry is a generator bug, so this throws rather than returning undefined.
 */
export function bundleEntry(bundle: GeneratedBundle): GeneratedFile {
  const entry = bundle.files.find((f) => f.path === bundle.entry)
  if (!entry) {
    throw new Error(`Generated bundle has no entry file at "${bundle.entry}"`)
  }
  return entry
}

/** The files wrangler must upload as code (entry + modules), in bundle order. */
export function bundleCodeFiles(bundle: GeneratedBundle): GeneratedFile[] {
  return bundle.files.filter((f) => f.role === 'entry' || f.role === 'module')
}

const SAFE_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/

const RESERVED_CODE_FILENAMES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'tsconfig.json',
  'jsconfig.json',
])

/**
 * True when npm, wrangler, or tsc would interpret a file of this name in the
 * deploy directory instead of treating it as inert worker code. Code-role
 * files are written verbatim to the directory where `npm install` and
 * `wrangler deploy` run, so these names must never be claimable by
 * user-edited bundles — regardless of nesting (Node and esbuild resolve the
 * nearest package.json, so depth is no protection).
 */
function isReservedCodePath(path: string): boolean {
  const segments = path.toLowerCase().split('/')
  if (segments.includes('node_modules')) return true
  const basename = segments[segments.length - 1]!
  return RESERVED_CODE_FILENAMES.has(basename) || basename.startsWith('wrangler.')
}

/**
 * Asserts a bundle-relative path is safe to write: non-empty, relative,
 * no traversal, and conservative per-segment charset. Throws — silent
 * filtering would let local dev and deploy write different trees.
 */
export function assertSafeBundlePath(path: string): string {
  const segments = path.split('/')
  const valid =
    segments.length > 0 &&
    segments.every((segment) => SAFE_SEGMENT.test(segment) && !segment.includes('..'))
  if (!valid) {
    throw new Error(`Unsafe bundle file path: "${path}"`)
  }
  return path
}

/**
 * Validates bundle invariants once, at generate time: the entry exists,
 * every path is safe, no code file claims a toolchain-interpreted name, and
 * paths stay unique even after the deploy pipeline's .ts→.js rewrite.
 * Consumers (deployers, local dev) can then trust the bundle instead of
 * re-implementing checks divergently.
 */
export function validateBundle(bundle: GeneratedBundle): GeneratedBundle {
  bundleEntry(bundle)
  const rewritten = new Set<string>()
  for (const file of bundle.files) {
    assertSafeBundlePath(file.path)
    const isCode = file.role === 'entry' || file.role === 'module'
    if (isCode && isReservedCodePath(file.path)) {
      throw new Error(`Reserved toolchain filename in bundle: "${file.path}" — rename the file`)
    }
    const outPath = isCode ? file.path.replace(/\.ts$/, '.js') : file.path
    if (rewritten.has(outPath)) {
      throw new Error(`Bundle file paths collide after compile rewrite: "${outPath}"`)
    }
    rewritten.add(outPath)
  }
  return bundle
}
