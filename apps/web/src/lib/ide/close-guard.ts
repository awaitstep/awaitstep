/** A close that has to wait for the person to decide what happens to unsaved text. */
export interface CloseRequest {
  /** Every tab the close would shut. */
  paths: string[]
  /** The subset with unsaved changes, in tab order. */
  dirty: string[]
}

/**
 * Decides whether closing `paths` can go ahead. Returns null when no tab
 * involved is dirty; otherwise the request to ask about, once for the whole
 * close rather than per file.
 */
export function guardClose(
  paths: readonly string[],
  dirty: ReadonlySet<string>,
): CloseRequest | null {
  const unsaved = paths.filter((path) => dirty.has(path))
  return unsaved.length === 0 ? null : { paths: [...paths], dirty: unsaved }
}
