import type { LibraryKind } from '../library-api'

/** `?item=&file=&new=` on the Library IDE's URL: what to open first, or a new item to name. */
export interface LibraryCodeSearch {
  item?: string
  file?: string
  new?: LibraryKind
}

export function parseLibraryCodeSearch(search: Record<string, unknown>): LibraryCodeSearch {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
  return {
    ...(text(search.item) && { item: text(search.item) }),
    ...(text(search.file) && { file: text(search.file) }),
    ...((search.new === 'module' || search.new === 'node') && { new: search.new }),
  }
}
