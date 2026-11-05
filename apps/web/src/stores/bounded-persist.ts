/** Remembered text is a convenience; this is all of it one browser keeps (localStorage has ~5 MB for the whole origin). */
export const MAX_PERSISTED_TEXT_CHARS = 512 * 1024

/**
 * The newest entries of `entries` (last key = newest) whose text fits `maxEach`,
 * as many as fit in `MAX_PERSISTED_TEXT_CHARS` together. Anything left out is
 * only forgotten on reload; it stays in memory.
 */
export function boundPersistedText<T>(
  entries: Record<string, T>,
  textLength: (entry: T) => number,
  maxEach: number,
): Record<string, T> {
  const kept: [string, T][] = []
  let total = 0
  for (const [key, entry] of Object.entries(entries).reverse()) {
    const length = textLength(entry)
    if (length > maxEach || total + length > MAX_PERSISTED_TEXT_CHARS) continue
    total += length
    kept.push([key, entry])
  }
  return Object.fromEntries(kept.reverse())
}
