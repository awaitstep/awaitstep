import type { FileHits, SearchHit, SearchResults } from './search'

export interface ResultLocation {
  path: string
  line: number
  column: number
}

export type ResultRow =
  | {
      kind: 'file'
      key: string
      path: string
      generated: boolean
      count: number
      expanded: boolean
    }
  | {
      kind: 'hit'
      key: string
      path: string
      generated: boolean
      hit: SearchHit
      parentKey: string
    }

export function fileKey(path: string): string {
  return `file:${path}`
}

export function hitKey(location: ResultLocation): string {
  return `hit:${location.path}:${location.line}:${location.column}`
}

/** The rows on screen, in order: each file, then its hits unless it is folded. */
export function flattenResults(
  results: SearchResults,
  collapsed: ReadonlySet<string>,
): ResultRow[] {
  const rows: ResultRow[] = []
  for (const file of results.files) {
    const key = fileKey(file.path)
    const expanded = !collapsed.has(file.path)
    rows.push({
      kind: 'file',
      key,
      path: file.path,
      generated: file.generated,
      count: file.hits.length,
      expanded,
    })
    if (!expanded) continue
    for (const hit of file.hits) {
      rows.push({
        kind: 'hit',
        key: hitKey({ path: file.path, line: hit.line, column: hit.column }),
        path: file.path,
        generated: file.generated,
        hit,
        parentKey: key,
      })
    }
  }
  return rows
}

export type ResultIntent =
  | { type: 'focus'; key: string }
  | { type: 'expand'; path: string }
  | { type: 'collapse'; path: string }
  | { type: 'open'; key: string }
  | { type: 'input' }
  | { type: 'escape' }

interface ResultKeyEvent {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

/**
 * Keyboard for the result list: ↑/↓ step through what is showing, ← folds a
 * file (or steps from a hit to its file), → unfolds, Enter opens a hit or
 * folds a file, Esc returns to the editor. ↑ from the first row goes back to
 * the search box, the way ↓ from the box came in.
 */
export function resultKeyIntent(
  rows: readonly ResultRow[],
  focusedKey: string | null,
  event: ResultKeyEvent,
): ResultIntent | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  const index = rows.findIndex((row) => row.key === focusedKey)
  const row = rows[index]
  switch (event.key) {
    case 'ArrowDown': {
      const next = row ? rows[index + 1] : rows[0]
      return next ? { type: 'focus', key: next.key } : null
    }
    case 'ArrowUp': {
      if (!row) return null
      const previous = rows[index - 1]
      return previous ? { type: 'focus', key: previous.key } : { type: 'input' }
    }
    case 'Home':
      return rows[0] ? { type: 'focus', key: rows[0].key } : null
    case 'End':
      return rows.length > 0 ? { type: 'focus', key: rows[rows.length - 1]!.key } : null
    case 'ArrowLeft':
      if (!row) return null
      if (row.kind === 'hit') return { type: 'focus', key: row.parentKey }
      return row.expanded ? { type: 'collapse', path: row.path } : null
    case 'ArrowRight':
      if (!row || row.kind === 'hit') return null
      if (!row.expanded) return { type: 'expand', path: row.path }
      return rows[index + 1]?.kind === 'hit' ? { type: 'focus', key: rows[index + 1]!.key } : null
    case 'Enter':
      if (!row) return null
      if (row.kind === 'hit') return { type: 'open', key: row.key }
      return row.expanded
        ? { type: 'collapse', path: row.path }
        : { type: 'expand', path: row.path }
    case 'Escape':
      return { type: 'escape' }
    default:
      return null
  }
}

function sameLocation(a: ResultLocation, path: string, hit: SearchHit): boolean {
  return a.path === path && a.line === hit.line && a.column === hit.column
}

function hitsInOrder(files: readonly FileHits[]): { path: string; hit: SearchHit }[] {
  return files.flatMap((file) => file.hits.map((hit) => ({ path: file.path, hit })))
}

/**
 * The hit after (or before) `current`, wrapping around: F4 / ⇧F4 from the
 * editor. Folded files still count — folding is about the list, not the
 * results. With no current hit, forward starts at the first and backward at
 * the last; a current hit the results no longer contain does the same.
 */
export function stepHit(
  results: SearchResults,
  current: ResultLocation | null,
  direction: 1 | -1,
): ResultLocation | null {
  const all = hitsInOrder(results.files)
  if (all.length === 0) return null
  const index = current ? all.findIndex((h) => sameLocation(current, h.path, h.hit)) : -1
  const target =
    index === -1
      ? direction === 1
        ? all[0]!
        : all[all.length - 1]!
      : all[(index + direction + all.length) % all.length]!
  return { path: target.path, line: target.hit.line, column: target.hit.column }
}

/** The hit at a location, for reveal (it carries the end column). */
export function findHit(results: SearchResults, location: ResultLocation): SearchHit | null {
  const file = results.files.find((f) => f.path === location.path)
  return file?.hits.find((h) => h.line === location.line && h.column === location.column) ?? null
}

const LINE_BREAK = /\r\n|\r|\n/

/**
 * The results narrowed to hits the files still back up: the file exists and
 * its line still holds the matched text where the hit says. Results are a
 * moment behind the editor (a pause after typing, then the worker), so F4
 * checks before it jumps rather than selecting a range that moved away.
 */
export function currentHits(
  results: SearchResults,
  files: ReadonlyMap<string, { source: string }>,
): SearchResults {
  const kept: FileHits[] = []
  let total = 0
  for (const file of results.files) {
    const source = files.get(file.path)?.source
    if (source === undefined) continue
    const lines = source.split(LINE_BREAK)
    const hits = file.hits.filter((hit) => {
      const matched = hit.text.slice(hit.matchStart, hit.matchEnd)
      return lines[hit.line - 1]?.startsWith(matched, hit.column - 1) === true
    })
    if (hits.length === 0) continue
    kept.push({ ...file, hits })
    total += hits.length
  }
  return { files: kept, total, capped: results.capped }
}
