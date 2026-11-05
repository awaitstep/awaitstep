import { describe, expect, it } from 'vitest'
import { runSearch, type SearchResults } from '../ide/search'
import {
  fileKey,
  findHit,
  flattenResults,
  hitKey,
  resultKeyIntent,
  stepHit,
} from '../ide/search-results'
import { CHARGE_FILES } from './fixtures/search/files'

const outcome = runSearch(CHARGE_FILES, {
  query: 'chargeOrder',
  caseSensitive: true,
  wholeWord: false,
  regex: false,
})
const results: SearchResults = outcome.kind === 'results' ? outcome.results : (null as never)
const key = (k: string) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false })

describe('flattenResults', () => {
  it('lists each file then its hits, and hides the hits of a folded file', () => {
    const open = flattenResults(results, new Set())
    expect(open.map((r) => r.kind)).toEqual([
      'file',
      'hit',
      'file',
      'hit',
      'hit',
      'file',
      'hit',
      'hit',
    ])
    const folded = flattenResults(results, new Set(['lib/payments/charge.ts']))
    expect(folded.filter((r) => r.kind === 'hit')).toHaveLength(3)
    expect(folded.find((r) => r.key === fileKey('lib/payments/charge.ts'))).toMatchObject({
      expanded: false,
      count: 2,
    })
  })
})

describe('resultKeyIntent', () => {
  const rows = flattenResults(results, new Set())
  const firstFile = rows[0]!.key
  const firstHit = rows[1]!.key

  it('moves down and up through the rows, and up from the first row returns to the box', () => {
    expect(resultKeyIntent(rows, firstFile, key('ArrowDown'))).toEqual({
      type: 'focus',
      key: firstHit,
    })
    expect(resultKeyIntent(rows, firstHit, key('ArrowUp'))).toEqual({
      type: 'focus',
      key: firstFile,
    })
    expect(resultKeyIntent(rows, firstFile, key('ArrowUp'))).toEqual({ type: 'input' })
    expect(resultKeyIntent(rows, rows[rows.length - 1]!.key, key('ArrowDown'))).toBeNull()
  })

  it('collapses with ←, expands with →, and ← on a hit steps to its file', () => {
    expect(resultKeyIntent(rows, firstFile, key('ArrowLeft'))).toEqual({
      type: 'collapse',
      path: 'lib/errors.ts',
    })
    expect(resultKeyIntent(rows, firstHit, key('ArrowLeft'))).toEqual({
      type: 'focus',
      key: firstFile,
    })
    const folded = flattenResults(results, new Set(['lib/errors.ts']))
    expect(resultKeyIntent(folded, folded[0]!.key, key('ArrowRight'))).toEqual({
      type: 'expand',
      path: 'lib/errors.ts',
    })
    expect(resultKeyIntent(rows, firstFile, key('ArrowRight'))).toEqual({
      type: 'focus',
      key: firstHit,
    })
  })

  it('opens a hit on Enter, folds a file on Enter, and Esc leaves', () => {
    expect(resultKeyIntent(rows, firstHit, key('Enter'))).toEqual({ type: 'open', key: firstHit })
    expect(resultKeyIntent(rows, firstFile, key('Enter'))).toEqual({
      type: 'collapse',
      path: 'lib/errors.ts',
    })
    expect(resultKeyIntent(rows, firstHit, key('Escape'))).toEqual({ type: 'escape' })
  })

  it('leaves modified keys to the shortcuts', () => {
    expect(resultKeyIntent(rows, firstHit, { ...key('Enter'), metaKey: true })).toBeNull()
  })
})

describe('stepHit', () => {
  const all = results.files.flatMap((f) =>
    f.hits.map((h) => ({ path: f.path, line: h.line, column: h.column })),
  )

  it('starts at the first hit going forward and the last going back', () => {
    expect(stepHit(results, null, 1)).toEqual(all[0])
    expect(stepHit(results, null, -1)).toEqual(all[all.length - 1])
  })

  it('moves one hit at a time, across files, and wraps', () => {
    expect(stepHit(results, all[0]!, 1)).toEqual(all[1])
    expect(stepHit(results, all[all.length - 1]!, 1)).toEqual(all[0])
    expect(stepHit(results, all[0]!, -1)).toEqual(all[all.length - 1])
  })

  it('restarts when the current hit is no longer in the results', () => {
    expect(stepHit(results, { path: 'gone.ts', line: 1, column: 1 }, 1)).toEqual(all[0])
  })

  it('has nowhere to go without results', () => {
    expect(stepHit({ files: [], total: 0, capped: false }, null, 1)).toBeNull()
  })
})

describe('findHit / hitKey', () => {
  it('finds the hit a location names, with its end column', () => {
    const file = results.files[0]!
    const hit = file.hits[0]!
    expect(findHit(results, { path: file.path, line: hit.line, column: hit.column })).toBe(hit)
    expect(findHit(results, { path: file.path, line: 999, column: 1 })).toBeNull()
    expect(hitKey({ path: 'a.ts', line: 2, column: 3 })).toBe('hit:a.ts:2:3')
  })
})
