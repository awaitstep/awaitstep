/** `?item=&file=` on the Library IDE's URL: what to open first. */
export interface LibraryCodeSearch {
  item?: string
  file?: string
}

export function parseLibraryCodeSearch(search: Record<string, unknown>): LibraryCodeSearch {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
  return {
    ...(text(search.item) && { item: text(search.item) }),
    ...(text(search.file) && { file: text(search.file) }),
  }
}
