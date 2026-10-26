import type { ReactNode } from 'react'

/**
 * Whether an optional slot was given something to render. Unlike `slot && …`,
 * a `0` counts as content, so it lands inside the slot's wrapper rather than
 * as a stray text node beside it.
 */
export function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== ''
}
