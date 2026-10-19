import { describe, expect, it } from 'vitest'
import type { GeneratedFile } from '@awaitstep/codegen'
import { dirtyPaths, liveDrafts, overlayDrafts } from '../ide/drafts'

const files = new Map<string, GeneratedFile>([
  ['a.ts', { path: 'a.ts', source: 'base a', role: 'module' }],
  ['b.ts', { path: 'b.ts', source: 'base b', role: 'module' }],
])

describe('overlayDrafts', () => {
  it('returns the baseline untouched when no draft differs from it', () => {
    expect(overlayDrafts(files, {})).toBe(files)
    expect(overlayDrafts(files, { 'a.ts': { source: 'base a', baseHash: 'h' } })).toBe(files)
  })

  it('lays drafts over the baseline, keeping untouched file objects, without mutating it', () => {
    const merged = overlayDrafts(files, {
      'a.ts': { source: 'edited a', baseHash: 'h' },
      'gone.ts': { source: 'orphan', baseHash: null },
    })
    expect(merged.get('a.ts')?.source).toBe('edited a')
    expect(merged.get('b.ts')).toBe(files.get('b.ts'))
    expect(merged.has('gone.ts')).toBe(false)
    expect(files.get('a.ts')?.source).toBe('base a')
  })
})

describe('dirtyPaths / liveDrafts', () => {
  it('reports drafts that differ from the baseline, including orphans', () => {
    const drafts = {
      'a.ts': { source: 'edited a', baseHash: 'h' },
      'b.ts': { source: 'base b', baseHash: 'h' },
      'gone.ts': { source: 'orphan', baseHash: null },
    }
    expect(dirtyPaths(files, drafts)).toEqual(['a.ts', 'gone.ts'])
    expect(liveDrafts(files, drafts)).toEqual({
      'a.ts': drafts['a.ts'],
      'gone.ts': drafts['gone.ts'],
    })
  })

  it('keeps the same drafts object when nothing was saved', () => {
    const drafts = { 'a.ts': { source: 'edited a', baseHash: 'h' } }
    expect(liveDrafts(files, drafts)).toBe(drafts)
  })
})
