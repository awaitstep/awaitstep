import {
  LIBRARY_MODULE_ENTRY,
  LIBRARY_NODE_ICON_PATH,
  LIBRARY_NODE_MANIFEST,
  LIBRARY_NODE_TEMPLATE,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FILE_BYTES,
  MAX_PROJECT_TOTAL_BYTES,
  PACKAGE_MANIFEST_PATH,
  isProjectCodePath,
  libraryFilePathError,
  libraryIconError,
  libraryImportSlugs,
  moduleVersionChoice,
  nodeVersionChoice,
  nodeVersionFolder,
  parsePackageManifest,
  projectFileBytes,
  validateCustomNodeManifest,
  validateDependencySpecs,
  validatePackageManifest,
  type LibraryItemKind,
  type LibraryVersionChoice,
  type ValidationError,
} from '@awaitstep/ir'
import type { LibraryResolvedModule } from '@awaitstep/db'

export interface LibrarySourceFile {
  path: string
  source: string
}

/** The draft folders a node's working copy holds (`1.0.1/…`), sorted. */
export function draftFolders(paths: Iterable<string>): string[] {
  const folders = new Set<string>()
  for (const path of paths) {
    const folder = nodeVersionFolder(path)
    if (folder) folders.add(folder)
  }
  return [...folders].sort()
}

/**
 * The `#modules/<slug>` slugs the code files import. A module never imports
 * itself: its own slug (a header comment naming its import path, say) is
 * dropped, so it never lands in the usage rows or the check's imports.
 */
export function codeImports(
  files: readonly LibrarySourceFile[],
  item?: { kind: LibraryItemKind; slug: string },
): string[] {
  const slugs = libraryImportSlugs(
    files.filter((f) => isProjectCodePath(f.path)).map((f) => f.source),
  )
  return item?.kind === 'module' ? slugs.filter((slug) => slug !== item.slug) : slugs
}

export interface LibraryCheck {
  /** The version a publish would create, when one can be chosen. */
  version: LibraryVersionChoice
  problems: ValidationError[]
  /** What the published code would import: the files a publish would snapshot. */
  imports: string[]
  /** The files a publish would snapshot, relative to the version. */
  snapshot: LibrarySourceFile[]
}

function sizeProblems(files: readonly LibrarySourceFile[]): ValidationError[] {
  const problems: ValidationError[] = []
  if (files.length > MAX_PROJECT_FILES) {
    problems.push({ path: '', message: `Maximum ${MAX_PROJECT_FILES} files` })
  }
  let total = 0
  for (const file of files) {
    const bytes = projectFileBytes(file.source)
    total += bytes
    if (bytes > MAX_PROJECT_FILE_BYTES) {
      problems.push({ path: file.path, message: `Exceeds ${MAX_PROJECT_FILE_BYTES} bytes` })
    }
  }
  if (total > MAX_PROJECT_TOTAL_BYTES) {
    problems.push({ path: '', message: `Files exceed ${MAX_PROJECT_TOTAL_BYTES} bytes in total` })
  }
  return problems
}

function moduleCheck(files: readonly LibrarySourceFile[], latest: string | null): LibraryCheck {
  const problems: ValidationError[] = []
  const manifest = files.find((f) => f.path === PACKAGE_MANIFEST_PATH)
  if (!manifest)
    problems.push({ path: PACKAGE_MANIFEST_PATH, message: 'A module needs a package.json' })
  else problems.push(...validatePackageManifest(manifest.source, PACKAGE_MANIFEST_PATH))
  if (!files.some((f) => f.path === LIBRARY_MODULE_ENTRY)) {
    problems.push({
      path: LIBRARY_MODULE_ENTRY,
      message: `A module needs ${LIBRARY_MODULE_ENTRY}: it is what '#modules/<slug>' imports`,
    })
  }
  const declared = manifest ? parsePackageManifest(manifest.source)?.version : undefined
  return {
    version: moduleVersionChoice(declared, latest),
    problems,
    imports: codeImports(files),
    snapshot: [...files],
  }
}

function nodeCheck(files: readonly LibrarySourceFile[], latest: string | null): LibraryCheck {
  const problems: ValidationError[] = []
  const folders = draftFolders(files.map((f) => f.path))
  const version = nodeVersionChoice(folders, latest)
  const icon = files.find((f) => f.path === LIBRARY_NODE_ICON_PATH)
  if (icon) {
    const iconError = libraryIconError(icon.source)
    if (iconError) problems.push({ path: LIBRARY_NODE_ICON_PATH, message: iconError })
  }
  if (!version.ok) return { version, problems, imports: [], snapshot: [] }
  const prefix = `${version.version}/`
  const inFolder = files
    .filter((f) => f.path.startsWith(prefix))
    .map((f) => ({ path: f.path.slice(prefix.length), source: f.source }))
  const manifest = inFolder.find((f) => f.path === LIBRARY_NODE_MANIFEST)
  if (!manifest) {
    problems.push({
      path: `${prefix}${LIBRARY_NODE_MANIFEST}`,
      message: 'A node version needs node.json',
    })
  } else {
    const parsed = validateCustomNodeManifest(
      manifest.source,
      version.version,
      `${prefix}${LIBRARY_NODE_MANIFEST}`,
    )
    problems.push(...parsed.errors)
    if (parsed.definition?.dependencies) {
      problems.push(
        ...validateDependencySpecs(
          parsed.definition.dependencies,
          `${prefix}${LIBRARY_NODE_MANIFEST}.dependencies`,
        ),
      )
    }
  }
  if (!inFolder.some((f) => f.path === LIBRARY_NODE_TEMPLATE)) {
    problems.push({
      path: `${prefix}${LIBRARY_NODE_TEMPLATE}`,
      message: 'A node version needs template.ts',
    })
  }
  const snapshot = icon ? [...inFolder, { path: icon.path, source: icon.source }] : inFolder
  return { version, problems, imports: codeImports(inFolder), snapshot }
}

/**
 * Everything a publish would refuse, without writing: path rules, the
 * manifest, the version rule, size caps, and imports that resolve to no
 * published module in reach. `resolved` is what the imports resolve to.
 */
export function checkLibraryItem(
  item: { kind: LibraryItemKind; slug: string },
  files: readonly LibrarySourceFile[],
  latest: string | null,
  resolved: readonly LibraryResolvedModule[],
): LibraryCheck {
  const { kind } = item
  const pathProblems = files.flatMap((f) => {
    const error = libraryFilePathError(kind, f.path)
    return error ? [{ path: f.path, message: `"${f.path}" ${error}` }] : []
  })
  const raw = kind === 'module' ? moduleCheck(files, latest) : nodeCheck(files, latest)
  const check = { ...raw, imports: raw.imports.filter((s) => kind !== 'module' || s !== item.slug) }
  const bySlug = new Map(resolved.map((r) => [r.slug, r]))
  const importProblems = check.imports.flatMap((slug): ValidationError[] => {
    const found = bySlug.get(slug)
    if (!found) {
      return [
        {
          path: `#modules/${slug}`,
          message: `No module "${slug}" here or in the project’s library`,
        },
      ]
    }
    if (found.latestVersion === null) {
      return [
        { path: `#modules/${slug}`, message: `Module "${slug}" has no published version yet` },
      ]
    }
    return []
  })
  const versionProblems: ValidationError[] = check.version.ok
    ? []
    : [{ path: 'version', message: check.version.message }]
  return {
    ...check,
    problems: [
      ...pathProblems,
      ...versionProblems,
      ...check.problems,
      ...sizeProblems(files),
      ...importProblems,
    ],
  }
}
