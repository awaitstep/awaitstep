/**
 * The list with the current item moved to the front, the rest in their own
 * order: a card grid always opens on the project or workspace you're in.
 */
export function currentFirst<T>(items: readonly T[], isCurrent: (item: T) => boolean): T[] {
  const current = items.filter(isCurrent)
  return current.length === 0
    ? [...items]
    : [...current, ...items.filter((item) => !isCurrent(item))]
}
