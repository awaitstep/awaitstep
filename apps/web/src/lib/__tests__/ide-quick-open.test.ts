import { describe, expect, it } from 'vitest'
import { rankFiles, splitHighlights } from '../ide/quick-open'

const paths = [
  'worker.ts',
  'wrangler.json',
  'package.json',
  'src/helpers.ts',
  'src/nodes/fetch_data.ts',
  'src/nodes/send_email.ts',
  'src/nodes/wait_for_approval.ts',
]

describe('rankFiles', () => {
  it('lists every path alphabetically for an empty query', () => {
    expect(rankFiles('   ', paths).map((r) => r.path)).toEqual([...paths].sort())
  })

  it('drops paths that do not contain the query as a subsequence', () => {
    const results = rankFiles('zzz', paths)
    expect(results).toEqual([])
  })

  it('ranks an exact basename above partial matches', () => {
    const results = rankFiles('worker.ts', paths)
    expect(results[0].path).toBe('worker.ts')
  })

  it('prefers basename and word-boundary hits over scattered characters', () => {
    const results = rankFiles('fetch', paths).map((r) => r.path)
    expect(results[0]).toBe('src/nodes/fetch_data.ts')
  })

  it('matches initials across separators', () => {
    const results = rankFiles('wfa', paths).map((r) => r.path)
    expect(results[0]).toBe('src/nodes/wait_for_approval.ts')
  })

  it('is case-insensitive and reports match positions for highlighting', () => {
    const [top] = rankFiles('WRANG', paths)
    expect(top.path).toBe('wrangler.json')
    expect(top.positions).toEqual([0, 1, 2, 3, 4])
  })

  it('honours the result limit', () => {
    expect(rankFiles('s', paths, 2)).toHaveLength(2)
  })

  it('breaks score ties on shorter path, then alphabetically', () => {
    const results = rankFiles('json', ['b/wrangler.json', 'a/wrangler.json', 'wrangler.json'])
    expect(results.map((r) => r.path)).toEqual([
      'wrangler.json',
      'a/wrangler.json',
      'b/wrangler.json',
    ])
  })
})

describe('splitHighlights', () => {
  it('merges adjacent matched and unmatched characters into runs', () => {
    expect(splitHighlights('wrangler.json', [0, 1, 2, 9], 0)).toEqual([
      { text: 'wra', hit: true },
      { text: 'ngler.', hit: false },
      { text: 'j', hit: true },
      { text: 'son', hit: false },
    ])
  })

  it('offsets positions for a substring of the full path', () => {
    const [top] = rankFiles('fetch', ['src/nodes/fetch_data.ts'])
    const name = 'fetch_data.ts'
    const segments = splitHighlights(name, top.positions, top.path.length - name.length)
    expect(segments[0]).toEqual({ text: 'fetch', hit: true })
    expect(segments.map((s) => s.text).join('')).toBe(name)
  })

  it('returns no segments for empty text', () => {
    expect(splitHighlights('', [0], 0)).toEqual([])
  })
})
