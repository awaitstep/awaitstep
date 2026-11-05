import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { useIdeStore } from '../../stores/ide-store'
import { escapeRegex, importerSearch, type SearchHit } from './search'
import { currentHits, findHit, stepHit, type ResultLocation } from './search-results'

/**
 * Opens a hit in the editor with the match selected. The editor takes the
 * keyboard once the file's model is showing (see `applyReveal`).
 */
export function openSearchHit(path: string, hit: SearchHit): void {
  const location: ResultLocation = { path, line: hit.line, column: hit.column }
  useIdeSearchStore.getState().setCurrent(location)
  useIdeStore.getState().revealLocation({ ...location, endColumn: hit.endColumn })
}

/**
 * What ⇧⌘F should search for: the editor's selection or word at the caret.
 * From the palette (a dialog holds the keyboard) the editor's selection is
 * read anyway; from anywhere else it counts only while the editor has focus.
 */
export function editorSearchSeed(): string | null {
  const fromDialog = globalThis.document?.activeElement?.closest('[role="dialog"]') != null
  return useIdeStore.getState().editorHandle?.searchSeed(fromDialog) ?? null
}

/**
 * ⇧⌘F and the palette command: shows Search and puts the keyboard in its
 * box. `seed` is the editor's selection (or the word at the caret) and
 * becomes the query; without one the box keeps what it had, selected, so
 * typing replaces it.
 */
export function findInFiles(seed?: string | null): void {
  const text = seed?.trim()
  useIdeLayoutStore.getState().showSideBar('search')
  const search = useIdeSearchStore.getState()
  // In regex mode the selection is text to find, not a pattern.
  if (text) search.searchFor({ query: search.regex ? escapeRegex(text) : text })
  else search.requestFocus()
}

/** Shows Search with the keyboard in its box and leaves the query alone. */
export function showSearch(): void {
  useIdeLayoutStore.getState().showSideBar('search')
  useIdeSearchStore.getState().requestFocus()
}

/**
 * A rename's "Show". The toast outlives the workspace, so once that is gone
 * (`dispose`) the button does nothing: the search store survives into the
 * next workspace and must not receive this one's path.
 */
export function createImporterShower() {
  let disposed = false
  return {
    show(specifier: string): void {
      if (disposed) return
      useIdeLayoutStore.getState().showSideBar('search')
      // Only your own files: the toast counted those, so the list shows those.
      useIdeSearchStore
        .getState()
        .searchFor({ ...importerSearch(specifier), includeGenerated: false })
    },
    dispose(): void {
      disposed = true
    },
  }
}

/**
 * F4 / ⇧F4 from the editor: the next or previous hit, wrapping. Only hits
 * the files still back up count (see `currentHits`). Returns false, having
 * done nothing, when there is nothing to step to, so the key can go to
 * whoever else wants it.
 */
export function stepSearchHit(
  direction: 1 | -1,
  files: ReadonlyMap<string, { source: string }>,
): boolean {
  const { outcome, current } = useIdeSearchStore.getState()
  if (outcome?.kind !== 'results') return false
  const results = currentHits(outcome.results, files)
  const target = stepHit(results, current, direction)
  const hit = target && findHit(results, target)
  if (!target || !hit) return false
  openSearchHit(target.path, hit)
  return true
}
