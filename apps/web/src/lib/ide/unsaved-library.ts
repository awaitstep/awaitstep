import {
  MAX_LIBRARY_IMPORTS,
  isLibraryBundlePath,
  isProjectCodePath,
  libraryImportSlugs,
} from '@awaitstep/ir'
import type {
  BundledLibraryModule,
  EditorLibraryModules,
  SourceDiagnostic,
  SourceFile,
} from '../api-client'
import type { Drafts } from './drafts'

/** The `#modules/<slug>` slugs the workflow's own code imports, as saved and as edited. */
export interface LibraryRoots {
  saved: string[]
  edited: string[]
}

/**
 * What the workflow's own code imports from the Library, the way a deploy
 * reads its roots: only project code (not Library files, docs or JSON), as
 * saved and with the drafts laid over it. `paths` are the workflow's own
 * files; a new file exists only as a draft.
 */
export function libraryRoots(
  saved: ReadonlyMap<string, { source: string }>,
  drafts: Drafts,
  paths: Iterable<string>,
): LibraryRoots {
  const code = new Set<string>()
  for (const path of [...paths, ...Object.keys(drafts)]) {
    if (isProjectCodePath(path) && !isLibraryBundlePath(path)) code.add(path)
  }
  const savedSources: string[] = []
  const editedSources: string[] = []
  for (const path of code) {
    const before = saved.get(path)?.source
    if (before !== undefined) savedSources.push(before)
    const after = drafts[path]?.source ?? before
    if (after !== undefined) editedSources.push(after)
  }
  return { saved: libraryImportSlugs(savedSources), edited: libraryImportSlugs(editedSources) }
}

/**
 * The canvas's saved side, read once per bundle: the imports of the bundle's
 * own code (its step modules carry each node's saved code), and the stored
 * files' sources, which stay part of what the canvas edits.
 */
export function canvasSavedCode(
  bundle: readonly { path: string; source: string; hash?: string }[],
): { slugs: string[]; stored: string[] } {
  const code = bundle.filter(
    (file) => isProjectCodePath(file.path) && !isLibraryBundlePath(file.path),
  )
  return {
    slugs: libraryImportSlugs(code.map((file) => file.source)),
    stored: code.filter((file) => file.hash !== undefined).map((file) => file.source),
  }
}

/** The canvas's roots: as saved, and with each node's code as the canvas holds it now. */
export function canvasLibraryRoots(
  saved: { slugs: string[]; stored: string[] },
  nodeCode: readonly string[],
): LibraryRoots {
  return { saved: saved.slugs, edited: libraryImportSlugs([...saved.stored, ...nodeCode]) }
}

/**
 * The slugs to resolve for the editor, or none: only when the edited code
 * imports something the saved code does not, and no more than one bundle
 * may name (a deploy reports that, on save).
 */
export function slugsToResolve(roots: LibraryRoots): string[] {
  const saved = new Set(roots.saved)
  const changed = roots.edited.some((slug) => !saved.has(slug))
  if (!changed || roots.edited.length > MAX_LIBRARY_IMPORTS) return []
  return roots.edited
}

/**
 * The files Code shows with the Library as the edited code would bundle it:
 * the saved bundle's module folders give way to the editor's answer, which
 * covers every module the edited code reaches. The workflow's own files
 * (`own`) are never replaced, even under `modules/`: a deploy refuses that
 * layout, and the editor must not show Library code in place of the user's.
 */
export function withEditorLibrary(
  files: ReadonlyMap<string, SourceFile>,
  saved: readonly Pick<BundledLibraryModule, 'slug'>[],
  answer: { files: readonly SourceFile[] },
  own: ReadonlySet<string>,
): Map<string, SourceFile> {
  const savedFolders = saved.map((module) => `modules/${module.slug}/`)
  const result = new Map<string, SourceFile>()
  for (const [path, file] of files) {
    if (own.has(path) || !savedFolders.some((folder) => path.startsWith(folder))) {
      result.set(path, file)
    }
  }
  for (const file of answer.files) if (!own.has(file.path)) result.set(file.path, file)
  return result
}

/**
 * The source's findings with its module findings replaced by the editor's:
 * those describe the saved imports, the editor's answer the edited ones.
 * Findings on a canvas node (a custom node) stay with the source.
 */
export function withEditorLibraryDiagnostics(
  source: readonly SourceDiagnostic[],
  answer: Pick<EditorLibraryModules, 'diagnostics'> | null,
): SourceDiagnostic[] {
  if (!answer) return [...source]
  const kept = source.filter((d) => d.source !== 'library' || d.nodeId !== undefined)
  return [...kept, ...answer.diagnostics]
}
