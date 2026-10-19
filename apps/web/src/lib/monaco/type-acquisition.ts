/**
 * Automatic type acquisition for the code workspace: the npm packages a
 * project imports get their `.d.ts` files from jsDelivr and are laid into
 * the TypeScript program as extra libs under a shared `node_modules` root,
 * so hover, completion and cross-file checks know the real types. Pure
 * functions with an injected fetch; the registry and hook bind them.
 */
import { PACKAGE_MANIFEST_PATH, parsePackageManifest, validatePackageManifest } from '@awaitstep/ir'
import { fileLanguage } from '../ide/file-tree'

export interface PackageSpec {
  name: string
  /** A semver range from package.json, or `latest`. */
  range: string
}

export interface TypeFile {
  /** Package-relative, leading slash: `/dist/index.d.ts`. */
  path: string
  content: string
}

export interface AcquiredPackage {
  name: string
  version: string
  /** The package.json plus every declaration file; empty when the package ships none. */
  files: TypeFile[]
}

export interface FetchLike {
  (
    url: string,
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>
}

/** Every workflow's models live under `awaitstep://workflow/<id>/`; this root is their common parent. */
export const TYPE_LIB_ROOT = 'awaitstep://workflow/node_modules/'

export const MAX_TYPE_FILES_PER_PACKAGE = 400
const FETCH_POOL = 8

const SPECIFIER_PATTERNS = [
  // import x from 'y' / import 'y' / export * from 'y' / import type … from 'y'
  /(?:^|[^\w$.])(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"\n]+)['"]/g,
  // import('y') / require('y')
  /\b(?:import|require)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
]

/** Module specifiers a source imports, in order of appearance, duplicates removed. */
export function importSpecifiers(source: string): string[] {
  const found = new Set<string>()
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) found.add(match[1]!)
  }
  return [...found]
}

/**
 * The npm package a bare specifier belongs to (`zod/v4` → `zod`,
 * `@scope/pkg/sub` → `@scope/pkg`), or null for anything that is not an
 * npm package: relative and `#app/` paths, URLs, and platform modules
 * (`node:`, `cloudflare:`) that have ambient types instead.
 */
export function packageName(specifier: string): string | null {
  if (!specifier || /^[./#]/.test(specifier) || /^[a-z]+:/i.test(specifier)) return null
  const segments = specifier.split('/')
  if (specifier.startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null
  }
  return segments[0] || null
}

/** `@types` counterpart: `zod` → `@types/zod`, `@scope/pkg` → `@types/scope__pkg`. */
export function typesPackageName(name: string): string {
  return name.startsWith('@') ? `@types/${name.slice(1).replace('/', '__')}` : `@types/${name}`
}

/**
 * The packages to acquire for a set of sources: each imported package
 * once, at the range the project's dependencies declare or `latest` when
 * it is undeclared (a node's own dependency, installed by the deploy).
 */
export function acquirablePackages(
  sources: Iterable<string>,
  declared: Readonly<Record<string, string>>,
): PackageSpec[] {
  const names = new Set<string>()
  for (const source of sources) {
    for (const specifier of importSpecifiers(source)) {
      const name = packageName(specifier)
      if (name) names.add(name)
    }
  }
  return [...names].sort().map((name) => ({ name, range: declared[name] ?? 'latest' }))
}

/** `name@range`, the identity a package is fetched and cached under. */
export function specKey(spec: PackageSpec): string {
  return `${spec.name}@${spec.range}`
}

export interface AcquisitionPlan {
  specs: PackageSpec[]
  /** The package set as one string, so callers can compare plans cheaply. */
  key: string
}

/**
 * What a workspace needs acquired: the packages its code files import, at
 * the ranges a valid package.json declares. An invalid manifest declares
 * nothing (every package falls back to `latest`), the same rule the deploy
 * applies when it refuses the manifest.
 */
export function planAcquisition(files: ReadonlyMap<string, { source: string }>): AcquisitionPlan {
  const sources: string[] = []
  for (const [path, file] of files) {
    const language = fileLanguage(path)
    if (language === 'typescript' || language === 'javascript') sources.push(file.source)
  }
  const manifest = files.get(PACKAGE_MANIFEST_PATH)?.source
  const declared =
    manifest && validatePackageManifest(manifest).length === 0
      ? (parsePackageManifest(manifest)?.dependencies ?? {})
      : {}
  const specs = acquirablePackages(sources, declared)
  return { specs, key: specs.map(specKey).join('\n') }
}

/** The declaration an untyped (or unreachable) package gets, so imports of it are `any` rather than errors. */
export function stubDeclaration(name: string): string {
  return `declare module '${name}';\ndeclare module '${name}/*';\n`
}

export function typeLibUri(name: string, path: string): string {
  return `${TYPE_LIB_ROOT}${name}${path}`
}

export function stubLibUri(name: string): string {
  return `${TYPE_LIB_ROOT}${name}/__awaitstep_stub__.d.ts`
}

function isDeclarationFile(path: string): boolean {
  return /\.d\.(c|m)?ts$/.test(path) && !path.includes('/node_modules/')
}

async function resolveVersion(spec: PackageSpec, fetchFn: FetchLike): Promise<string | null> {
  const res = await fetchFn(
    `https://data.jsdelivr.com/v1/package/resolve/npm/${spec.name}@${encodeURIComponent(spec.range)}`,
  )
  if (!res.ok) return null
  const body = (await res.json()) as { version?: string | null }
  return body.version ?? null
}

async function listFiles(name: string, version: string, fetchFn: FetchLike): Promise<string[]> {
  const res = await fetchFn(`https://data.jsdelivr.com/v1/package/npm/${name}@${version}/flat`)
  if (!res.ok) return []
  const body = (await res.json()) as { files?: { name: string }[] }
  return (body.files ?? []).map((f) => f.name)
}

async function fetchContents(
  name: string,
  version: string,
  paths: string[],
  fetchFn: FetchLike,
): Promise<TypeFile[]> {
  const files: TypeFile[] = []
  for (let i = 0; i < paths.length; i += FETCH_POOL) {
    const batch = paths.slice(i, i + FETCH_POOL)
    const contents = await Promise.all(
      batch.map(async (path) => {
        const res = await fetchFn(`https://cdn.jsdelivr.net/npm/${name}@${version}${path}`)
        return res.ok ? { path, content: await res.text() } : null
      }),
    )
    for (const file of contents) if (file) files.push(file)
  }
  return files
}

async function fetchOnePackage(
  spec: PackageSpec,
  fetchFn: FetchLike,
): Promise<AcquiredPackage | null> {
  const version = await resolveVersion(spec, fetchFn)
  if (!version) return null
  const all = await listFiles(spec.name, version, fetchFn)
  const declarations = all.filter(isDeclarationFile).slice(0, MAX_TYPE_FILES_PER_PACKAGE)
  if (declarations.length === 0) return { name: spec.name, version, files: [] }
  const wanted = all.includes('/package.json') ? ['/package.json', ...declarations] : declarations
  return {
    name: spec.name,
    version,
    files: await fetchContents(spec.name, version, wanted, fetchFn),
  }
}

/**
 * The declaration files for one package: its own `.d.ts` files, or the
 * matching `@types` package when it ships none. The result is empty (not
 * null) when neither exists, so the caller can stub the module; null means
 * the package could not be resolved at all (unknown name, no network).
 */
export async function fetchPackageTypes(
  spec: PackageSpec,
  fetchFn: FetchLike,
): Promise<AcquiredPackage | null> {
  const own = await fetchOnePackage(spec, fetchFn)
  if (!own || own.files.length > 0) return own
  const types = await fetchOnePackage(
    { name: typesPackageName(spec.name), range: 'latest' },
    fetchFn,
  )
  return types && types.files.length > 0 ? types : own
}

export interface TypeLib {
  uri: string
  content: string
}

/**
 * The extra libs that give `spec` a home under the shared node_modules
 * root: the package's declaration files (under its own name — `@types`
 * packages are placed under the name they describe, so plain resolution
 * finds them), or a stub when there is nothing to lay in.
 */
export function packageLibs(spec: PackageSpec, acquired: AcquiredPackage | null): TypeLib[] {
  if (!acquired || acquired.files.length === 0) {
    return [{ uri: stubLibUri(spec.name), content: stubDeclaration(spec.name) }]
  }
  return acquired.files.map((file) => ({
    uri: typeLibUri(spec.name, file.path),
    content: file.content,
  }))
}
