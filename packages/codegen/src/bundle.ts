import type { ProjectFile } from '@awaitstep/ir'
import {
  PACKAGE_MANIFEST_PATH,
  PROJECT_HANDLERS_PATH,
  PROJECT_ROOT_CONFIG_FILES,
  compiledPathKey,
  isProjectCodePath,
  isReservedToolchainPath,
} from '@awaitstep/ir'
import { GenerateInputError } from './errors.js'
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
 * The bundle's entry file. Every valid bundle has exactly one — and every
 * bundle is one a generator produced, so a missing entry is a generator bug:
 * this throws a plain error rather than one blamed on the workflow.
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

/** The only paths a config/meta-role file may have — exact, root-level. */
const BUNDLE_CONFIG_ALLOWLIST = new Set<string>(PROJECT_ROOT_CONFIG_FILES)

/**
 * Project-owned files ride along in the bundle: code becomes modules, the
 * root package.json is the deploy's `meta` input, other root toolchain
 * config is `config`, `handlers.ts` is the entry-handler input codegen has
 * already compiled into the entry, and everything else is an `asset`
 * written verbatim.
 */
export function projectBundleFiles(files: readonly ProjectFile[] | undefined): GeneratedFile[] {
  return (files ?? []).map((file) => ({
    path: file.path,
    source: file.source,
    role: projectFileRole(file.path),
  }))
}

function projectFileRole(path: string): GeneratedFile['role'] {
  if (path === PACKAGE_MANIFEST_PATH) return 'meta'
  if (path === PROJECT_HANDLERS_PATH) return 'handlers'
  if ((PROJECT_ROOT_CONFIG_FILES as readonly string[]).includes(path)) return 'config'
  return isProjectCodePath(path) ? 'module' : 'asset'
}

/**
 * Everything a deployer writes into the deploy directory: code and assets
 * only. Config/meta roles never reach the disk — the deployer generates
 * wrangler config and merges package.json itself, and a project tsconfig
 * is an editor-typing input, not something the bundler may read (its
 * `paths`/`baseUrl` could pull files off the build host). The handlers
 * file is annotation syntax, not a module: its handlers already live in
 * the entry.
 */
export function bundleDeployFiles(bundle: GeneratedBundle): GeneratedFile[] {
  return bundle.files.filter((f) => f.role === 'entry' || f.role === 'module' || f.role === 'asset')
}

/** The project's own package.json source, when the bundle carries one. */
export function bundlePackageManifest(bundle: GeneratedBundle): string | undefined {
  return bundle.files.find((f) => f.path === PACKAGE_MANIFEST_PATH)?.source
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
    throw new GenerateInputError(`Unsafe bundle file path: "${path}"`)
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
  if (bundle.primary !== undefined && !bundle.files.some((f) => f.path === bundle.primary)) {
    throw new GenerateInputError(`Bundle primary file is not in the bundle: "${bundle.primary}"`)
  }
  const rewritten = new Set<string>()
  for (const file of bundle.files) {
    assertSafeBundlePath(file.path)
    const isCode = file.role === 'entry' || file.role === 'module'
    // Code and assets are written verbatim to the directory where `npm
    // install` and `wrangler deploy` run, so toolchain names are never
    // claimable at any depth. Config/meta roles exist only for the root
    // files a project may own; a fixed allowlist here means no later change
    // to what deployers write can smuggle a lockfile or wrangler config in.
    if (file.role === 'config' || file.role === 'meta') {
      if (!BUNDLE_CONFIG_ALLOWLIST.has(file.path)) {
        throw new GenerateInputError(
          `Config/meta files are limited to ${PROJECT_ROOT_CONFIG_FILES.join(', ')} at the project root: "${file.path}"`,
        )
      }
    } else if (file.role === 'handlers') {
      if (file.path !== PROJECT_HANDLERS_PATH) {
        throw new GenerateInputError(
          `The handlers role belongs to ${PROJECT_HANDLERS_PATH} at the project root: "${file.path}"`,
        )
      }
    } else if (isReservedToolchainPath(file.path)) {
      throw new GenerateInputError(
        `Reserved toolchain filename in bundle: "${file.path}" — rename the file`,
      )
    }
    const outPath = isCode ? compiledPathKey(file.path) : file.path.toLowerCase()
    if (rewritten.has(outPath)) {
      throw new GenerateInputError(`Bundle file paths collide after compile rewrite: "${outPath}"`)
    }
    rewritten.add(outPath)
  }
  return bundle
}
