import type { SourceDiagnostic } from '@awaitstep/codegen'
import {
  CUSTOM_NODE_TYPE_PREFIX,
  LIBRARY_MODULE_IMPORT_PREFIX,
  LIBRARY_NODE_MANIFEST,
  LIBRARY_NODE_TEMPLATE,
  MAX_LIBRARY_IMPORTS,
  MAX_PROJECT_FILES,
  MAX_PROJECT_TOTAL_BYTES,
  PACKAGE_MANIFEST_PATH,
  customNodeType,
  isLibraryBundlePath,
  isProjectCodePath,
  libraryBundlePath,
  libraryImportSlugs,
  parsePackageManifest,
  validateCustomNodeManifest,
  type ArtifactIR,
  type NodeDefinition,
} from '@awaitstep/ir'
import type { DatabaseAdapter, DeploymentLibraryVersion, LibraryBundleItem } from '@awaitstep/db'
import { libraryImportProblems } from './library-imports.js'

/** A custom node as the registry layers it: its definition and its template. */
export interface CustomNodeEntry {
  definition: NodeDefinition
  template: string
}

/** A module folded into the bundle, as the workflow IDE labels its files. */
export interface BundledLibraryModule {
  itemId: string
  slug: string
  /** The workflow's workspace owns it, or the project does. */
  owner: 'workspace' | 'project'
  version: string
}

/** One manifest's dependencies, with who asked for them. */
export interface DependencySource {
  label: string
  dependencies: Record<string, string>
}

export interface LibraryFold {
  /** The IR with every bundled module's files under `modules/<slug>/`. */
  ir: ArtifactIR
  customNodes: CustomNodeEntry[]
  dependencySources: DependencySource[]
  /** What a deployment records it bundled. */
  library: DeploymentLibraryVersion[]
  /** The bundle paths the fold added: library code, never the workflow's own files. */
  paths: string[]
  /** The module slugs folded in, which the deploy manifest maps as `#modules/<slug>`. */
  moduleSlugs: string[]
  /** The modules folded in, by slug. */
  modules: BundledLibraryModule[]
  diagnostics: SourceDiagnostic[]
}

/** What a workflow's own code and canvas use from the Library: the roots of its bundle, and its usage rows. */
export function workflowLibraryRoots(ir: ArtifactIR): { slugs: string[]; nodeItemIds: string[] } {
  const sources: string[] = []
  for (const node of ir.nodes) {
    if (typeof node.data.code === 'string') sources.push(node.data.code)
  }
  if (ir.runtime?.triggerCode) sources.push(ir.runtime.triggerCode)
  for (const file of ir.runtime?.files ?? []) {
    if (isProjectCodePath(file.path)) sources.push(file.source)
  }
  const nodeItemIds = new Set<string>()
  for (const node of ir.nodes) {
    if (node.type.startsWith(CUSTOM_NODE_TYPE_PREFIX)) {
      nodeItemIds.add(node.type.slice(CUSTOM_NODE_TYPE_PREFIX.length))
    }
  }
  return { slugs: libraryImportSlugs(sources), nodeItemIds: [...nodeItemIds].sort() }
}

/** The most items one bundle may reach. */
export const MAX_LIBRARY_BUNDLE_ITEMS = MAX_LIBRARY_IMPORTS
/** The most library code one bundle may carry: twice a project's own total, and four times its files. */
export const MAX_LIBRARY_BUNDLE_BYTES = 2 * MAX_PROJECT_TOTAL_BYTES
export const MAX_LIBRARY_BUNDLE_FILES = 4 * MAX_PROJECT_FILES

function label(item: Pick<LibraryBundleItem, 'kind' | 'slug' | 'name' | 'version'>): string {
  const name = item.kind === 'module' ? item.slug : item.name
  return item.version ? `${name} ${item.version}` : name
}

/**
 * Folds the Library into a workflow's IR, the way a deploy bundles it:
 * every module the workflow reaches (directly, through a custom node, or
 * through another module) at its latest published version, and the custom
 * nodes it places. Nothing is stored; the IR returned is the bundle's.
 *
 * Every reason the result cannot ship comes back as a `library`
 * diagnostic: an unpublished or unknown item, a custom node out of reach,
 * one slug meaning two modules, imports library code may not make, or the
 * workflow's own files under `modules/`.
 */
export async function foldLibrary(
  db: DatabaseAdapter,
  place: { projectId: string; workspaceId: string | null },
  ir: ArtifactIR,
): Promise<LibraryFold> {
  const roots = workflowLibraryRoots(ir)
  const none: LibraryFold = {
    ir,
    customNodes: [],
    dependencySources: [],
    library: [],
    paths: [],
    moduleSlugs: [],
    modules: [],
    diagnostics: [],
  }
  if (roots.slugs.length === 0 && roots.nodeItemIds.length === 0) return none

  const { items, truncated, oversize } = await db.resolveLibraryBundle(
    { ...place, ...roots },
    {
      items: MAX_LIBRARY_BUNDLE_ITEMS,
      bytes: MAX_LIBRARY_BUNDLE_BYTES,
      files: MAX_LIBRARY_BUNDLE_FILES,
    },
  )
  const diagnostics: SourceDiagnostic[] = []
  const report = (message: string, extra: { nodeId?: string; path?: string } = {}) =>
    diagnostics.push({ source: 'library', message, ...extra })

  // Which items were cut is arbitrary, so nothing else said about them would be true.
  if (truncated) {
    report(`This workflow reaches more than ${MAX_LIBRARY_BUNDLE_ITEMS} library items`)
    return { ...none, diagnostics }
  }
  // Over a size limit the database sent no file bodies, so nothing can be folded.
  if (oversize) {
    report(
      `The library code this workflow reaches is over ${MAX_LIBRARY_BUNDLE_FILES} files or ${MAX_LIBRARY_BUNDLE_BYTES} bytes`,
    )
    return { ...none, diagnostics }
  }

  const byId = new Map(items.map((item) => [item.id, item]))
  const nodesOfType = (itemId: string) =>
    ir.nodes.filter((node) => node.type === customNodeType(itemId)).map((node) => node.id)

  // What each importer's `#modules/<slug>` reached; an import with no match did not resolve.
  const reached = new Set<string>()
  for (const item of items) {
    if (item.kind !== 'module') continue
    for (const importer of item.importers) reached.add(`${importer ?? ''}\u0000${item.slug}`)
  }
  for (const slug of roots.slugs) {
    if (!reached.has(`\u0000${slug}`)) {
      report(
        `Cannot resolve "${LIBRARY_MODULE_IMPORT_PREFIX}${slug}": no module of that name in this workspace or the project`,
      )
    }
  }
  for (const item of items) {
    for (const slug of item.imports) {
      if (item.kind === 'module' && slug === item.slug) continue
      if (!reached.has(`${item.id}\u0000${slug}`)) {
        report(
          `${label(item)} imports "${LIBRARY_MODULE_IMPORT_PREFIX}${slug}", which no module it can reach provides`,
        )
      }
    }
  }

  for (const itemId of roots.nodeItemIds) {
    const found = byId.get(itemId)
    if (found?.kind === 'node') continue
    for (const nodeId of nodesOfType(itemId)) {
      report(`Unknown custom node "${itemId}": it is not in this workspace or the project`, {
        nodeId,
      })
    }
  }

  // One bundle has one `modules/<slug>`: two modules answering one slug cannot both ship.
  const bySlug = new Map<string, LibraryBundleItem[]>()
  for (const item of items) {
    if (item.kind !== 'module') continue
    bySlug.set(item.slug, [...(bySlug.get(item.slug) ?? []), item])
  }
  const conflicted = new Set<string>()
  for (const [slug, modules] of bySlug) {
    if (modules.length < 2) continue
    conflicted.add(slug)
    const meanings = modules
      .map((module) => {
        const owner =
          module.workspaceId === null ? 'the project’s module' : 'this workspace’s module'
        const who = module.importers.map((importer) =>
          importer === null ? 'this workflow' : (byId.get(importer)?.name ?? 'a library item'),
        )
        return `${owner} for ${who.join(' and ')}`
      })
      .sort()
    report(
      `"${LIBRARY_MODULE_IMPORT_PREFIX}${slug}" means ${meanings.join(', but ')}; rename one of them`,
    )
  }

  const ownModuleFiles = (ir.runtime?.files ?? [])
    .map((file) => file.path)
    .filter(isLibraryBundlePath)
  const bundlesModules = items.some((item) => item.kind === 'module' && item.version !== null)
  if (bundlesModules && ownModuleFiles.length > 0) {
    report(
      `modules/ is reserved for library modules; move ${ownModuleFiles.map((p) => `"${p}"`).join(', ')} elsewhere`,
    )
  }

  const folded: { path: string; source: string }[] = []
  const customNodes: CustomNodeEntry[] = []
  const dependencySources: DependencySource[] = []
  const library: DeploymentLibraryVersion[] = []
  for (const item of items) {
    if (item.version === null) {
      const what = item.kind === 'module' ? `Module "${item.slug}"` : `Custom node "${item.name}"`
      const message = `${what} has no published version yet; publish it to use it`
      if (item.kind === 'node')
        for (const nodeId of nodesOfType(item.id)) report(message, { nodeId })
      else report(message)
      continue
    }
    library.push({ itemId: item.id, slug: item.slug, version: item.version })
    for (const problem of libraryImportProblems(item.kind, item.files)) {
      report(`${label(item)}: ${problem.message}`, {
        ...(item.kind === 'module' && { path: libraryBundlePath(item.slug, problem.path) }),
      })
    }
    if (item.kind === 'module') {
      const manifest = item.files.find((file) => file.path === PACKAGE_MANIFEST_PATH)
      const deps = manifest ? parsePackageManifest(manifest.source)?.dependencies : undefined
      if (deps && Object.keys(deps).length > 0) {
        dependencySources.push({ label: label(item), dependencies: deps })
      }
      if (conflicted.has(item.slug) || ownModuleFiles.length > 0) continue
      for (const file of item.files) {
        // A nested package.json would change how `#` imports resolve inside the folder.
        if (file.path === PACKAGE_MANIFEST_PATH) continue
        folded.push({ path: libraryBundlePath(item.slug, file.path), source: file.source })
      }
      continue
    }
    const entry = customNodeEntry(item)
    if ('error' in entry) {
      for (const nodeId of nodesOfType(item.id)) report(entry.error, { nodeId })
      continue
    }
    customNodes.push(entry)
    if (entry.definition.dependencies && Object.keys(entry.definition.dependencies).length > 0) {
      dependencySources.push({ label: label(item), dependencies: entry.definition.dependencies })
    }
  }

  const modules: BundledLibraryModule[] = items
    .filter(
      (item) =>
        item.kind === 'module' &&
        item.version !== null &&
        folded.some((f) => f.path.startsWith(libraryBundlePath(item.slug, ''))),
    )
    .map((item) => ({
      itemId: item.id,
      slug: item.slug,
      owner: item.workspaceId === null ? ('project' as const) : ('workspace' as const),
      version: item.version!,
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))

  return {
    ir:
      folded.length === 0
        ? ir
        : { ...ir, runtime: { ...ir.runtime, files: [...(ir.runtime?.files ?? []), ...folded] } },
    customNodes,
    dependencySources,
    library,
    paths: folded.map((file) => file.path),
    moduleSlugs: modules.map((module) => module.slug),
    modules,
    diagnostics,
  }
}

/**
 * Rewrites a workflow's usage rows from a version it now has as current:
 * every path that makes a version current (a save, a files commit, a
 * revert) calls this, so Used by and the delete guard follow the document.
 * `ir` must already carry the project files the version holds, and any
 * legacy trigger code.
 */
export function recordWorkflowLibraryUses(
  db: DatabaseAdapter,
  workflowId: string,
  ir: ArtifactIR,
): Promise<void> {
  const roots = workflowLibraryRoots(ir)
  return db.rewriteWorkflowLibraryUsages({
    workflowId,
    // Slugs are one row each, so they stay capped; nodes are one scoped
    // statement however many, so none is dropped before the reach check.
    slugs: roots.slugs.slice(0, MAX_LIBRARY_BUNDLE_ITEMS),
    nodeItemIds: roots.nodeItemIds,
  })
}

/** A published node version as the registry takes it, its id forced to `custom:<itemId>`. */
function customNodeEntry(item: LibraryBundleItem): CustomNodeEntry | { error: string } {
  const manifest = item.files.find((file) => file.path === LIBRARY_NODE_MANIFEST)
  const template = item.files.find((file) => file.path === LIBRARY_NODE_TEMPLATE)
  if (!manifest || !template) {
    return {
      error: `${label(item)} has no ${manifest ? LIBRARY_NODE_TEMPLATE : LIBRARY_NODE_MANIFEST}`,
    }
  }
  const parsed = validateCustomNodeManifest(manifest.source, item.version!, LIBRARY_NODE_MANIFEST)
  if (!parsed.definition) {
    return { error: `${label(item)}: ${parsed.errors.map((e) => e.message).join('; ')}` }
  }
  return {
    definition: { ...parsed.definition, id: customNodeType(item.id) },
    template: template.source,
  }
}
