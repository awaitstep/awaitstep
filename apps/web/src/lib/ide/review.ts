/** Below this editor width the review shows changes inline: two columns would be too narrow to read. */
export const INLINE_BELOW_PX = 1100

/** The unsaved files in the order Review steps through them: by path, so the order never jumps while typing. */
export function reviewOrder(dirty: Iterable<string>): string[] {
  return [...dirty].sort((a, b) => a.localeCompare(b))
}

/**
 * The file Review shows: the one asked for while it is unsaved, or while it
 * still exists (it stays on screen, with no changes, until the person
 * navigates; the view never jumps to another file under their cursor), else
 * the first unsaved file.
 */
export function currentReviewPath(
  order: readonly string[],
  requested: string | null,
  exists: (path: string) => boolean = () => false,
): string | null {
  if (requested !== null && (order.includes(requested) || exists(requested))) return requested
  return order[0] ?? null
}

/**
 * Where Review goes once `path` leaves the list (saved or reverted): the
 * file that slid into its place, else the one before it, else nothing.
 */
export function reviewPathAfterLeaving(order: readonly string[], path: string): string | null {
  const index = order.indexOf(path)
  if (index === -1) return currentReviewPath(order, null)
  return order[index + 1] ?? order[index - 1] ?? null
}

/** The neighbouring file, wrapping at the ends; null when there is nowhere else to go. */
export function stepReviewPath(
  order: readonly string[],
  current: string,
  direction: 1 | -1,
): string | null {
  const index = order.indexOf(current)
  // A file shown with no changes is not in the list: step to its nearest end.
  if (index === -1) return (direction === 1 ? order[0] : order.at(-1)) ?? null
  if (order.length < 2) return null
  return order[(index + direction + order.length) % order.length] ?? null
}

/** Side by side only when the person wants it and the editor is wide enough (unknown width counts as wide). */
export function effectiveSideBySide(inline: boolean, width: number | null): boolean {
  return !inline && (width === null || width >= INLINE_BELOW_PX)
}

/** "file 1 of 2 · 2 changes" */
export function reviewSummary(index: number, total: number, changes: number | null): string {
  if (index === -1) return 'no unsaved changes'
  const files = `file ${index + 1} of ${total}`
  if (changes === null) return files
  return `${files} · ${changes === 1 ? '1 change' : `${changes} changes`}`
}
