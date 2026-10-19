import type { ProjectFile, ValidationError } from './types.js'
import { validateDependencySpecs } from './dependencies.js'

/**
 * Specifier prefix that imports a project file from anywhere in the bundle:
 * `#app/` is the project root, so `#app/config/env` reaches `config/env.ts`
 * from the entry, a generated step module, or another project file alike.
 * A named prefix because Node's resolver rejects bare `#/…` specifiers.
 */
export const PROJECT_IMPORT_PREFIX = '#app/'

/**
 * The package.json `imports` entries every deploy carries. Node subpath
 * imports map to exact files, so each extension gets its own pattern:
 * extensionless specifiers resolve to `.js` (esbuild — and therefore
 * wrangler — falls back to `.ts` for sources), while JSON and explicit
 * `.mjs`/`.cjs`/`.mts`/`.cts`/`.js`/`.ts` specifiers keep their file.
 */
export const PROJECT_IMPORTS_FIELD: Readonly<Record<string, string>> = {
  '#app/*.json': './*.json',
  '#app/*.mjs': './*.mjs',
  '#app/*.cjs': './*.cjs',
  '#app/*.mts': './*.mjs',
  '#app/*.cts': './*.cjs',
  '#app/*.js': './*.js',
  '#app/*.ts': './*.js',
  '#app/*': './*.js',
}

export const MAX_PROJECT_FILES = 100
export const MAX_PROJECT_FILE_BYTES = 512_000
export const MAX_PROJECT_TOTAL_BYTES = 2_000_000
export const MAX_PROJECT_FILE_PATH_LENGTH = 300

/** Transpiled and bundled; everything else is written verbatim. */
export const PROJECT_CODE_EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'] as const
export const PROJECT_FILE_EXTENSIONS = [
  ...PROJECT_CODE_EXTENSIONS,
  'json',
  'md',
  'txt',
  'toml',
  'yaml',
  'yml',
  'css',
  'html',
  'sql',
] as const

export const PACKAGE_MANIFEST_PATH = 'package.json'

/**
 * The entry handlers (`@fetch` / `@queue` / `@scheduled`) as a project file.
 * When present it is the trigger-code source and replaces the legacy
 * trigger-code setting.
 */
export const PROJECT_HANDLERS_PATH = 'handlers.ts'

/** The project's handlers.ts source, or undefined when the project has none. */
export function projectHandlersSource(
  files: readonly ProjectFile[] | undefined,
): string | undefined {
  return files?.find((f) => f.path === PROJECT_HANDLERS_PATH)?.source
}

/**
 * Handler modules: the folder convention that supersedes the annotation
 * file. Plain ES modules with a default export; the filename is the only
 * fact the deploy reads from them (`handlers/queue/orders.ts` consumes the
 * `orders` queue). Everything else — the queue binding, cron expressions,
 * batch settings — stays declared in the IR or the deployment config.
 */
export const PROJECT_HANDLERS_DIR = 'handlers/'
export const HANDLER_FETCH_PATH = 'handlers/fetch.ts'
export const HANDLER_SCHEDULED_PATH = 'handlers/scheduled.ts'
export const HANDLER_QUEUE_DIR = 'handlers/queue/'

/**
 * Code the handlers share. It is the one module the generated entry
 * re-exports, so a class the entry must expose (a Durable Object, say)
 * still reaches the runtime, and module-level state stays single.
 */
export const HANDLER_SHARED_PATH = 'handlers/shared.ts'

/** Cloudflare's queue-name rule: lowercase alphanumerics and hyphens, 1–63 characters. */
export const QUEUE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export type HandlerEntry =
  { kind: 'fetch' } | { kind: 'scheduled' } | { kind: 'queue'; queue: string }

export interface ProjectHandlerModules {
  fetch?: string
  scheduled?: string
  queues: { queue: string; path: string }[]
  /** `handlers/shared.ts`, when the project has one. */
  shared?: string
}

function stemOf(path: string): string {
  const name = basenameOf(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/**
 * The handler a path under `handlers/` provides, or null when the path is
 * not a handler entry (a helper, an asset, a misspelt name). Any code
 * extension is accepted; the stem decides.
 */
export function handlerEntry(path: string): HandlerEntry | null {
  if (!path.startsWith(PROJECT_HANDLERS_DIR) || !isProjectCodePath(path)) return null
  const rest = path.slice(PROJECT_HANDLERS_DIR.length)
  if (!rest.includes('/')) {
    const stem = stemOf(rest)
    if (stem === 'fetch') return { kind: 'fetch' }
    if (stem === 'scheduled') return { kind: 'scheduled' }
    return null
  }
  if (path.startsWith(HANDLER_QUEUE_DIR)) {
    const name = path.slice(HANDLER_QUEUE_DIR.length)
    if (name.includes('/')) return null
    const queue = stemOf(name)
    return QUEUE_NAME_PATTERN.test(queue) ? { kind: 'queue', queue } : null
  }
  return null
}

/** The role a path fills, as one comparable key: `fetch`, `scheduled`, `queue:orders`. */
function entryKey(entry: HandlerEntry): string {
  return entry.kind === 'queue' ? `queue:${entry.queue}` : entry.kind
}

/**
 * The handler modules a project has, by role. Two files can name the same
 * entry (`fetch.ts` beside `fetch.mjs`); rather than let the file order
 * decide, the lowest path wins everywhere — writes of a second file for a
 * role are refused (see {@link handlerWriteError}), so this only settles
 * what older stored versions already contain.
 */
export function projectHandlerModules(
  files: readonly { path: string }[] | undefined,
): ProjectHandlerModules {
  const byRole = new Map<string, string>()
  let shared: string | undefined
  for (const { path } of files ?? []) {
    if (path === HANDLER_SHARED_PATH) shared = path
    const entry = handlerEntry(path)
    if (!entry) continue
    const key = entryKey(entry)
    const current = byRole.get(key)
    if (current === undefined || path < current) byRole.set(key, path)
  }
  const modules: ProjectHandlerModules = { queues: [], ...(shared && { shared }) }
  for (const [key, path] of byRole) {
    if (key === 'fetch') modules.fetch = path
    else if (key === 'scheduled') modules.scheduled = path
    else modules.queues.push({ queue: key.slice('queue:'.length), path })
  }
  modules.queues.sort((a, b) => a.queue.localeCompare(b.queue, 'en'))
  return modules
}

export function hasHandlerModules(modules: ProjectHandlerModules): boolean {
  return modules.fetch !== undefined || modules.scheduled !== undefined || modules.queues.length > 0
}

/**
 * Why `path` cannot be added beside `existing`: the annotation file and the
 * handler folder are two models of the same thing and never coexist, so a
 * project converts (or deletes `handlers.ts`) before it gains a module, and
 * cannot regain the file while modules exist.
 */
export function projectHandlersConflict(path: string, existing: Iterable<string>): string | null {
  const paths = [...existing]
  if (handlerEntry(path) && paths.includes(PROJECT_HANDLERS_PATH)) {
    return `${PROJECT_HANDLERS_PATH} and ${PROJECT_HANDLERS_DIR} cannot coexist — convert ${PROJECT_HANDLERS_PATH} to handler modules or delete it first`
  }
  if (path === PROJECT_HANDLERS_PATH && paths.some((p) => handlerEntry(p))) {
    return `${PROJECT_HANDLERS_PATH} and ${PROJECT_HANDLERS_DIR} cannot coexist — the project already uses handler modules`
  }
  return null
}

/**
 * Why `path` may not be *written* under `handlers/`, or null. These are
 * write-time rules, deliberately not part of {@link projectFilePathError}:
 * a stored version that predates the convention keeps validating and
 * deploying, while new files cannot introduce an inert look-alike
 * (`handlers/Fetch.ts` would never run) or a second file for a role.
 */
export function handlerWriteError(path: string, existing: Iterable<string>): string | null {
  if (!path.startsWith(PROJECT_HANDLERS_DIR)) return null
  const entry = handlerEntry(path)
  if (!entry) {
    if (path.startsWith(HANDLER_QUEUE_DIR)) {
      return `is not a queue consumer — ${HANDLER_QUEUE_DIR}<queue-name>.ts needs a Cloudflare queue name (lowercase letters, digits and hyphens, 1–63 characters)`
    }
    const rest = path.slice(PROJECT_HANDLERS_DIR.length)
    const stem = stemOf(rest).toLowerCase()
    if (!rest.includes('/') && (stem === 'fetch' || stem === 'scheduled')) {
      return `would never run — did you mean ${PROJECT_HANDLERS_DIR}${stem}.ts?`
    }
    return null
  }
  const key = entryKey(entry)
  for (const other of existing) {
    if (other === path) continue
    const otherEntry = handlerEntry(other)
    if (otherEntry && entryKey(otherEntry) === key) {
      return `would be a second ${key === 'fetch' || key === 'scheduled' ? key : `consumer for "${entry.kind === 'queue' ? entry.queue : key}"`} handler beside "${other}" — one file per entry`
    }
  }
  return null
}

/** Toolchain config a project may own, at the root only (nesting changes resolution). */
export const PROJECT_ROOT_CONFIG_FILES = ['package.json', 'tsconfig.json', 'jsconfig.json'] as const

/** Human-readable description of what the canvas generates and projects cannot shadow. */
export const GENERATED_PATH_RULES = ['worker.*', 'nodes/**', 'wrangler.*'] as const

const SAFE_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/

const ROOT_CONFIG_FILES = new Set<string>(PROJECT_ROOT_CONFIG_FILES)

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
])

function basenameOf(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1]!
}

export function fileExtension(path: string): string {
  const name = basenameOf(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isProjectCodePath(path: string): boolean {
  return (PROJECT_CODE_EXTENSIONS as readonly string[]).includes(fileExtension(path))
}

/**
 * The path as it exists after compile and on a case-insensitive disk:
 * lower-cased, TypeScript extensions rewritten to their JavaScript
 * counterparts. Two files with the same key would overwrite each other.
 */
export function compiledPathKey(path: string): string {
  return path
    .toLowerCase()
    .replace(/\.ts$/, '.js')
    .replace(/\.mts$/, '.mjs')
    .replace(/\.cts$/, '.cjs')
}

/**
 * The canvas writes these; a project file at the same path — in any case,
 * with any code extension — would be shadowed or shadow them.
 */
export function isGeneratedPath(path: string): boolean {
  const lower = path.toLowerCase()
  if (lower.startsWith('nodes/')) return true
  if (basenameOf(lower).startsWith('wrangler.')) return true
  const dot = lower.lastIndexOf('.')
  const stem = dot > 0 ? lower.slice(0, dot) : lower
  return (
    stem === 'worker' &&
    (PROJECT_CODE_EXTENSIONS as readonly string[]).includes(fileExtension(lower))
  )
}

/**
 * True when npm, wrangler, or tsc would interpret a file of this name in the
 * deploy directory instead of treating it as inert worker code. Node and
 * esbuild resolve the nearest package.json, so nesting is no protection.
 * Bundle code files must never claim one; project files may own the root
 * config files (see {@link projectFilePathError}).
 */
export function isReservedToolchainPath(path: string): boolean {
  const segments = path.toLowerCase().split('/')
  if (segments.includes('node_modules')) return true
  const basename = segments[segments.length - 1]!
  return (
    ROOT_CONFIG_FILES.has(basename) || LOCKFILES.has(basename) || basename.startsWith('wrangler.')
  )
}

/** UTF-8 size, the unit every project-file cap is expressed in. */
export function projectFileBytes(source: string): number {
  return new TextEncoder().encode(source).length
}

/**
 * Why a path cannot be a project file, or null when it can: conservative
 * segments (no dotfiles, no traversal), nothing the canvas generates, no
 * lockfiles or node_modules, toolchain config only at the root, and a
 * code/data extension.
 */
export function projectFilePathError(path: string): string | null {
  if (path.length > MAX_PROJECT_FILE_PATH_LENGTH) {
    return `exceeds ${MAX_PROJECT_FILE_PATH_LENGTH} characters`
  }
  const segments = path.split('/')
  if (segments.some((segment) => !SAFE_SEGMENT.test(segment) || segment.includes('..'))) {
    return 'contains an unsafe path segment'
  }
  if (isGeneratedPath(path)) {
    return 'is generated from the canvas'
  }
  const lower = segments.map((s) => s.toLowerCase())
  if (lower.includes('node_modules')) {
    return 'cannot live under node_modules'
  }
  const name = lower[lower.length - 1]!
  if (LOCKFILES.has(name)) {
    return 'is a lockfile the deploy generates'
  }
  if (ROOT_CONFIG_FILES.has(name) && segments.length > 1) {
    return 'must live at the project root'
  }
  if (!(PROJECT_FILE_EXTENSIONS as readonly string[]).includes(fileExtension(path))) {
    return `must end in ${PROJECT_FILE_EXTENSIONS.map((e) => `.${e}`).join(', ')}`
  }
  // Nothing handler-specific here: `handlers/` rules are write-time only
  // (see handlerWriteError), so versions stored before the convention keep
  // validating and deploying.
  return null
}

/**
 * The existing path that `path` would overwrite after compile or on a
 * case-insensitive disk (`a.ts` vs `a.js`, `Env.ts` vs `env.ts`), or null.
 */
export function findProjectPathCollision(path: string, existing: Iterable<string>): string | null {
  const key = compiledPathKey(path)
  for (const other of existing) {
    if (other !== path && compiledPathKey(other) === key) return other
  }
  return null
}

/** The package.json fields a deploy honours; everything else is dropped. */
export interface PackageManifest {
  name?: string
  version?: string
  description?: string
  license?: string
  type?: string
  engines?: Record<string, string>
  imports?: Record<string, string>
  dependencies?: Record<string, string>
}

const MANIFEST_STRING_FIELDS = ['name', 'version', 'description', 'license', 'type'] as const
const MANIFEST_MAP_FIELDS = ['engines', 'imports', 'dependencies'] as const

function isStringMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === 'string')
  )
}

/**
 * Parses a project package.json down to the honoured fields. Null when the
 * source is not a JSON object; fields of the wrong shape are dropped (the
 * validator reports them).
 */
export function parsePackageManifest(source: string): PackageManifest | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const raw = parsed as Record<string, unknown>
  const manifest: PackageManifest = {}
  for (const field of MANIFEST_STRING_FIELDS) {
    if (typeof raw[field] === 'string') manifest[field] = raw[field] as string
  }
  for (const field of MANIFEST_MAP_FIELDS) {
    if (isStringMap(raw[field])) manifest[field] = raw[field] as Record<string, string>
  }
  return manifest
}

/**
 * Rules for a project-owned package.json: a JSON object, registry-only
 * dependency specs (the same gate the dependencies setting passes), string
 * maps for `imports`/`engines` with `#`-prefixed import keys, and ESM only.
 */
export function validatePackageManifest(source: string, path = 'package.json'): ValidationError[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return [{ path, message: 'package.json must be valid JSON' }]
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return [{ path, message: 'package.json must be a JSON object' }]
  }
  const raw = parsed as Record<string, unknown>
  const errors: ValidationError[] = []
  for (const field of MANIFEST_MAP_FIELDS) {
    if (raw[field] !== undefined && !isStringMap(raw[field])) {
      errors.push({ path: `${path}.${field}`, message: `${field} must map strings to strings` })
    }
  }
  if (isStringMap(raw['dependencies'])) {
    errors.push(...validateDependencySpecs(raw['dependencies'], `${path}.dependencies`))
  }
  if (isStringMap(raw['imports'])) {
    for (const key of Object.keys(raw['imports'])) {
      if (!key.startsWith('#')) {
        errors.push({
          path: `${path}.imports`,
          message: `Import map keys must start with "#" ("${key}")`,
        })
      }
    }
  }
  if (raw['type'] !== undefined && raw['type'] !== 'module') {
    errors.push({ path: `${path}.type`, message: 'Workers deploy as ES modules — use "module"' })
  }
  return errors
}

/** The project's package.json, parsed, or null when it has none. */
export function projectPackageManifest(
  files: readonly ProjectFile[] | undefined,
): PackageManifest | null {
  const file = files?.find((f) => f.path === PACKAGE_MANIFEST_PATH)
  return file ? parsePackageManifest(file.source) : null
}

/**
 * Validates the project-file block of an IR runtime: per-path rules, the
 * per-file and total size caps, the file-count cap, uniqueness (including
 * paths that would collide after compile), and the package.json contract.
 * The single authority shared by IR validation (save, import, deploy) and
 * the per-file write endpoints.
 */
export function validateProjectFiles(
  files: readonly ProjectFile[],
  path = 'runtime.files',
): ValidationError[] {
  const errors: ValidationError[] = []
  if (files.length > MAX_PROJECT_FILES) {
    errors.push({ path, message: `Maximum ${MAX_PROJECT_FILES} project files` })
  }

  const seenByKey = new Map<string, string>()
  let total = 0
  files.forEach((file, index) => {
    const pathError = projectFilePathError(file.path)
    if (pathError) {
      errors.push({ path: `${path}[${index}].path`, message: `"${file.path}" ${pathError}` })
    }
    const key = compiledPathKey(file.path)
    const earlier = seenByKey.get(key)
    if (earlier === file.path) {
      errors.push({
        path: `${path}[${index}].path`,
        message: `Duplicate project file "${file.path}"`,
      })
    } else if (earlier !== undefined) {
      errors.push({
        path: `${path}[${index}].path`,
        message: `"${file.path}" would overwrite "${earlier}" after compile`,
      })
    } else {
      seenByKey.set(key, file.path)
    }

    const bytes = projectFileBytes(file.source)
    total += bytes
    if (bytes > MAX_PROJECT_FILE_BYTES) {
      errors.push({
        path: `${path}[${index}].source`,
        message: `"${file.path}" exceeds ${MAX_PROJECT_FILE_BYTES} bytes`,
      })
    }
    if (file.path === PACKAGE_MANIFEST_PATH) {
      errors.push(...validatePackageManifest(file.source, `${path}[${index}].source`))
    }
  })

  const handlersFile = files.findIndex((f) => f.path === PROJECT_HANDLERS_PATH)
  if (handlersFile !== -1 && files.some((f) => handlerEntry(f.path))) {
    errors.push({
      path: `${path}[${handlersFile}].path`,
      message: `${PROJECT_HANDLERS_PATH} and ${PROJECT_HANDLERS_DIR} cannot coexist`,
    })
  }

  if (total > MAX_PROJECT_TOTAL_BYTES) {
    errors.push({ path, message: `Project files exceed ${MAX_PROJECT_TOTAL_BYTES} bytes in total` })
  }
  return errors
}
