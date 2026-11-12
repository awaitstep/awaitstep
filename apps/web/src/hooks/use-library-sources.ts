import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { SourceFile } from '../lib/api-client'
import type { Drafts } from '../lib/ide/drafts'
import { libraryApi, type ApiLibraryTree } from '../lib/library-api'
import { idePath, type LibraryIdeIndex } from '../lib/library/ide-index'
import { importedModuleSlugs, reachedItems } from '../lib/library/reach'
import { libraryItemKeys } from '../data/dashboard/library'

/** A loaded library file, as the editor and the type program take it. */
export interface LibrarySourceFile extends SourceFile {
  readOnly: boolean
}

export interface LibrarySources {
  /** The place's own files whose text is loaded, by IDE path. */
  baseline: ReadonlyMap<string, LibrarySourceFile>
  /** The project's modules this place imports, at their latest published version, read-only. */
  projectModules: ReadonlyMap<string, LibrarySourceFile>
  /** Listed files still on their way. */
  loading: ReadonlySet<string>
}

const EMPTY: ReadonlyMap<string, LibrarySourceFile> = new Map()

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

/**
 * The text the Library IDE needs, and no more: every file of the items
 * that have a tab open (or are selected), plus the files of each own module
 * those import, transitively. A `#modules/<slug>` the place does not own
 * is, in a workspace, the project's module: it is read at its latest
 * published version, which is what a deploy bundles (D5). Each file is
 * cached by its hash, so a save or an outside change refetches that file alone.
 */
export function useLibrarySources(
  index: LibraryIdeIndex,
  projectModules: ApiLibraryTree['projectModules'],
  wantedItems: ReadonlySet<string>,
  drafts: Drafts,
): LibrarySources {
  const entries = useMemo(() => [...index.files.entries()], [index])
  // Grows as text arrives: a file that loads may import another module.
  const [reach, setReach] = useState<ReadonlySet<string>>(wantedItems)
  const results = useQueries({
    queries: entries.map(([, file]) => ({
      queryKey: [...libraryItemKeys.file(file.itemId, file.itemPath), file.hash],
      queryFn: () => libraryApi.getFile(file.itemId, file.itemPath),
      staleTime: Infinity,
      enabled: reach.has(file.itemId),
    })),
  })
  const data = results.map((result) => result.data)
  // One fixed-length dependency standing for every file's data.
  const dataKey = results.map((result) => result.dataUpdatedAt).join(',')

  const loaded = useMemo(() => {
    const baseline = new Map<string, LibrarySourceFile>()
    const loading = new Set<string>()
    entries.forEach(([path, file], i) => {
      if (!reach.has(file.itemId)) return
      const got = data[i]
      if (!got) {
        loading.add(path)
        return
      }
      baseline.set(path, {
        path,
        source: got.source,
        role: 'module',
        // Published files have no write precondition: they never change.
        ...(file.readOnly ? {} : { hash: file.hash }),
        readOnly: file.readOnly,
      })
    })
    return { baseline, loading }
    // `data` is read through `dataKey`, which changes whenever any entry does.
  }, [entries, reach, dataKey])

  const next = reachedItems(index, wantedItems, loaded.baseline, drafts)
  if (!sameSet(next, reach)) setReach(next)

  // The project's modules a foreign import names, as the workspace's tree lists them.
  const foreign = importedModuleSlugs(index, loaded.baseline, drafts).foreign
  const projectItems = projectModules.filter(
    (module) => module.latestVersion !== null && foreign.includes(module.slug),
  )
  const versions = useQueries({
    queries: projectItems.map((item) => ({
      queryKey: libraryItemKeys.version(item.id, item.latestVersion!),
      queryFn: () => libraryApi.getVersion(item.id, item.latestVersion!),
      staleTime: Infinity,
    })),
  })
  const versionData = versions.map((query) => query.data)
  const versionKey = versions.map((query) => query.dataUpdatedAt).join(',')
  const imported = useMemo(() => {
    if (projectItems.length === 0) return EMPTY
    const files = new Map<string, LibrarySourceFile>()
    projectItems.forEach((item, i) => {
      for (const file of versionData[i]?.files ?? []) {
        const path = idePath({ kind: 'module', slug: item.slug }, file.path)
        files.set(path, { path, source: file.source, role: 'module', readOnly: true })
      }
    })
    return files
    // As above: the entries are the cache's own objects.
  }, [projectModules, foreign.join('|'), versionKey])

  return { baseline: loaded.baseline, projectModules: imported, loading: loaded.loading }
}
