import type { StepRow } from './step-order'

/** Where a vertical rail line stops: the row's dot, or its bottom edge. */
export type RailEnd = 'dot' | 'bottom'

export interface RailLane {
  level: number
  /** A line from the row's top. Ancestor lanes stop at the dot of a last fork. */
  to: RailEnd
}

export interface RailRow {
  depth: number
  /** Vertical lines from the row's top: ancestor lanes and the row's own way in. */
  lanes: RailLane[]
  /** The row's own line continues from its dot to the row's bottom. */
  below: boolean
  /** A tick from the parent's lane to the dot: the first row of an arm. */
  connector: boolean
}

/**
 * The vertical lines each row draws. A lane belongs to the nearest row above it
 * at its level; it is drawn while that row's subtree continues, and stops at
 * the last fork when the subtree ends — so two sibling arms never join into one
 * line, and no line crosses a dot that is the end of a chain.
 *
 * `rows` is the visible list (`visibleRows`), so folding a container also
 * shortens the lane it lent to its arms. One sweep per level keeps this linear
 * in the rendered lines rather than rescanning the tail for every row.
 */
export function railRows(rows: readonly StepRow[]): RailRow[] {
  const lanes: RailLane[][] = rows.map(() => [])
  let maxDepth = 0
  for (const row of rows) maxDepth = Math.max(maxDepth, row.depth)

  for (let level = 0; level < maxDepth; level++) {
    let at = 0
    while (at < rows.length) {
      if (rows[at]!.depth <= level) {
        at++
        continue
      }
      const start = at
      while (at < rows.length && rows[at]!.depth > level) at++
      const end = at
      const next = rows[end]
      // A rejoin at the lane's own level keeps the trunk going through the
      // whole subtree; a new root at that level does not.
      const continues = next !== undefined && next.depth === level && next.continuesAbove
      let lastFork = -1
      if (!continues) {
        for (let k = start; k < end; k++) {
          const row = rows[k]!
          if (row.depth === level + 1 && row.armStart) lastFork = k
        }
        if (lastFork === -1) continue
      }
      for (let k = start; k < end; k++) {
        if (continues || k < lastFork) lanes[k]!.push({ level, to: 'bottom' })
        else if (k === lastFork) lanes[k]!.push({ level, to: 'dot' })
      }
    }
  }

  return rows.map((row, at) => {
    const next = rows[at + 1]
    const below =
      next !== undefined &&
      (next.depth > row.depth || (next.depth === row.depth && next.continuesAbove))
    if (row.continuesAbove) lanes[at]!.push({ level: row.depth, to: 'dot' })
    return {
      depth: row.depth,
      lanes: lanes[at]!,
      below,
      connector: row.armStart && row.depth > 0,
    }
  })
}
