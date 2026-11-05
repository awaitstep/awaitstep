import type { StepRow } from './step-order'

export type StepsIntent =
  | { type: 'focus'; nodeId: string }
  | { type: 'expand' | 'collapse' | 'select'; nodeId: string }
  | { type: 'escape' }

/**
 * What a key does in the Steps list, as data. Up and down move between the
 * rows showing; left and right fold and unfold a container (left on a closed
 * one, or on a plain step, steps out to the container it sits in); Enter and
 * Space pick the step. `rows` are the rows showing, `collapsed` the folded
 * containers.
 */
export function stepsKeyIntent(
  rows: readonly StepRow[],
  collapsed: ReadonlySet<string>,
  focusedId: string | null,
  key: string,
): StepsIntent | null {
  const index = rows.findIndex((row) => row.nodeId === focusedId)
  const row = rows[index]
  const focusAt = (i: number): StepsIntent | null =>
    rows[i] ? { type: 'focus', nodeId: rows[i]!.nodeId } : null

  switch (key) {
    case 'ArrowDown':
      return row ? focusAt(index + 1) : focusAt(0)
    case 'ArrowUp':
      return row ? focusAt(index - 1) : focusAt(0)
    case 'Home':
      return focusAt(0)
    case 'End':
      return focusAt(rows.length - 1)
    case 'ArrowRight':
      if (!row?.container) return null
      if (collapsed.has(row.nodeId)) return { type: 'expand', nodeId: row.nodeId }
      return rows[index + 1]?.parentId === row.nodeId ? focusAt(index + 1) : null
    case 'ArrowLeft':
      if (!row) return null
      if (row.container && !collapsed.has(row.nodeId))
        return { type: 'collapse', nodeId: row.nodeId }
      return row.parentId !== null ? { type: 'focus', nodeId: row.parentId } : null
    case 'Enter':
    case ' ':
      return row ? { type: 'select', nodeId: row.nodeId } : null
    case 'Escape':
      return { type: 'escape' }
    default:
      return null
  }
}
