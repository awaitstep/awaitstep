import type { SourceDiagnostic } from '@awaitstep/codegen'
import {
  CUSTOM_NODE_TYPE_PREFIX,
  LIBRARY_NODE_MANIFEST,
  LIBRARY_NODE_TEMPLATE,
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
import {
  BUNDLE_LIMITS,
  MAX_LIBRARY_BUNDLE_ITEMS,
  bundledModule,
  bySlug,
  importMessages,
  label,
  limitMessage,
  moduleBundleFiles,
  slugConflicts,
  unpublishedMessage,
  type BundledLibraryModule,
} from './library-resolution.js'

export type { BundledLibraryModule } from './library-resolution.js'

/** A custom node as the registry layers it: its definition and its template. */
export interface CustomNodeEntry {
  definition: NodeDefinition
  template: string
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

  const bundle = await db.resolveLibraryBundle({ ...place, ...roots }, BUNDLE_LIMITS)
  const { items } = bundle
  const diagnostics: SourceDiagnostic[] = []
  const report = (message: string, extra: { nodeId?: string; path?: string } = {}) =>
    diagnostics.push({ source: 'library', message, ...extra })

  const overLimit = limitMessage(bundle)
  if (overLimit) {
    report(overLimit)
    return { ...none, diagnostics }
  }

  const byId = new Map(items.map((item) => [item.id, item]))
  const nodesOfType = (itemId: string) =>
    ir.nodes.filter((node) => node.type === customNodeType(itemId)).map((node) => node.id)

  for (const message of importMessages(items, roots.slugs)) report(message)

  for (const itemId of roots.nodeItemIds) {
    const found = byId.get(itemId)
    if (found?.kind === 'node') continue
    for (const nodeId of nodesOfType(itemId)) {
      report(`Unknown custom node "${itemId}": it is not in this workspace or the project`, {
        nodeId,
      })
    }
  }

  const { conflicted, messages: conflictMessages } = slugConflicts(items)
  for (const message of conflictMessages) report(message)

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
      const message = unpublishedMessage(item)
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
      folded.push(...moduleBundleFiles(item))
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
    .map(bundledModule)
    .sort(bySlug)

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
