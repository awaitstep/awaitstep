import { isProjectCodePath, libraryImportSlugs } from '@awaitstep/ir'
import type { Drafts } from '../ide/drafts'
import type { LibraryIdeIndex } from './ide-index'

type Loaded = ReadonlyMap<string, { path: string; source: string }>

function codeOf(loaded: Loaded, drafts: Drafts, only?: (path: string) => boolean): string[] {
  const code: string[] = []
  for (const [path, file] of loaded) {
    if (only && !only(path)) continue
    if (isProjectCodePath(path)) code.push(drafts[path]?.source ?? file.source)
  }
  return code
}

/**
 * The items whose files the IDE loads: the wanted ones, and every own
 * module a loaded file (as edited) imports, transitively among what is loaded.
 */
export function reachedItems(
  index: LibraryIdeIndex,
  wanted: ReadonlySet<string>,
  loaded: Loaded,
  drafts: Drafts,
): Set<string> {
  const moduleBySlug = new Map<string, string>()
  for (const item of index.items) if (item.kind === 'module') moduleBySlug.set(item.slug, item.id)
  const reached = new Set([...wanted].filter((id) => index.itemById.has(id)))
  let grew = true
  while (grew) {
    grew = false
    const inReach = (path: string) => {
      const item = index.itemAt(path)
      return item !== null && reached.has(item.id)
    }
    for (const slug of libraryImportSlugs(codeOf(loaded, drafts, inReach))) {
      const id = moduleBySlug.get(slug)
      if (id && !reached.has(id)) {
        reached.add(id)
        grew = true
      }
    }
  }
  return reached
}

/** The `#modules/<slug>` the loaded code imports, split by whether the place owns them. */
export function importedModuleSlugs(
  index: LibraryIdeIndex,
  loaded: Loaded,
  drafts: Drafts,
): { own: string[]; foreign: string[] } {
  const owned = new Set(index.items.filter((i) => i.kind === 'module').map((i) => i.slug))
  const own: string[] = []
  const foreign: string[] = []
  for (const slug of libraryImportSlugs(codeOf(loaded, drafts))) {
    ;(owned.has(slug) ? own : foreign).push(slug)
  }
  return { own: own.sort(), foreign: foreign.sort() }
}
