/** The `data-plus` value a canvas + carries: its node and side. */
export function plusKey(nodeId: string, side: string): string {
  return `${nodeId}:${side}`
}

/**
 * Whether a press landed on the + with `key`. Compared as a value, never
 * built into a selector: a node id comes from the IR and may hold quotes.
 */
export function isPressOnPlus(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('[data-plus]')?.getAttribute('data-plus') === key
}
