import { projectBundleFiles, type GeneratedFile, type SourceDiagnostic } from '@awaitstep/codegen'
import type { DatabaseAdapter, LibraryBundleItem, WorkflowCustomNodeReach } from '@awaitstep/db'
import { libraryBundlePath } from '@awaitstep/ir'
import { libraryImportProblems } from './library-imports.js'
import {
  BUNDLE_LIMITS,
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

/** The Library modules a workflow's code imports, as Code's editor needs them before a save. */
export interface EditorLibraryModules {
  /** Every module the imports reach, at the published version a deploy would bundle. */
  modules: BundledLibraryModule[]
  /** Their files under `modules/<slug>/`, as `GET /source` lists the bundle's. */
  files: GeneratedFile[]
  /** Why an import would not resolve or ship, in a deploy's words. */
  diagnostics: SourceDiagnostic[]
}

/**
 * Resolves every `#modules/<slug>` a workflow's code imports, saved or not,
 * from the workflow's place exactly as a deploy would: its workspace, then
 * the project; latest published versions; the modules they import in turn;
 * one slug meaning two modules and the bundle limits judged across all of
 * them. Library files the editor types against, never written anywhere.
 * Unlike a deploy it does not judge the workflow's own files or canvas: only
 * the modules its code names. `reach` is the caller's: a workspace key
 * resolves its workspace's own modules only, never the project's.
 */
export async function resolveEditorLibraryModules(
  db: DatabaseAdapter,
  place: { projectId: string; workspaceId: string | null },
  slugs: readonly string[],
  reach: WorkflowCustomNodeReach,
): Promise<EditorLibraryModules> {
  const bundle = await db.resolveLibraryBundle(
    { ...place, slugs: [...slugs], nodeItemIds: [], reach },
    BUNDLE_LIMITS,
  )
  const diagnostics: SourceDiagnostic[] = []
  const report = (message: string, path?: string) =>
    diagnostics.push({ source: 'library', message, ...(path && { path }) })
  const overLimit = limitMessage(bundle)
  if (overLimit) {
    report(overLimit)
    return { modules: [], files: [], diagnostics }
  }
  const modules = bundle.items.filter((item) => item.kind === 'module')
  for (const message of importMessages(modules, slugs)) report(message)
  const { conflicted, messages } = slugConflicts(modules)
  for (const message of messages) report(message)
  const shipped: LibraryBundleItem[] = []
  for (const item of modules) {
    if (item.version === null) {
      report(unpublishedMessage(item))
      continue
    }
    for (const problem of libraryImportProblems(item.kind, item.files)) {
      report(`${label(item)}: ${problem.message}`, libraryBundlePath(item.slug, problem.path))
    }
    if (!conflicted.has(item.slug)) shipped.push(item)
  }
  return {
    modules: shipped.map(bundledModule).sort(bySlug),
    files: projectBundleFiles(shipped.flatMap(moduleBundleFiles)),
    diagnostics,
  }
}
