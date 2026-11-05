import { describe, expect, it } from 'vitest'
import { activeTargetPath } from '../use-review-actions'

const baseline = new Map([
  ['a.ts', { path: 'a.ts', source: 'saved a', role: 'module' as const, hash: 'ha' }],
  ['b.ts', { path: 'b.ts', source: 'saved b', role: 'module' as const, hash: 'hb' }],
])
const drafts = {
  'a.ts': { source: 'mine a', baseHash: 'ha' },
  'b.ts': { source: 'mine b', baseHash: 'hb' },
}

describe('activeTargetPath', () => {
  it('is the file itself for a file tab', () => {
    expect(activeTargetPath(baseline, { activePath: 'b.ts', drafts, reviewPath: null })).toBe(
      'b.ts',
    )
  })

  it('is the compared file for a Compare tab', () => {
    expect(
      activeTargetPath(baseline, { activePath: 'ide:compare:a.ts', drafts, reviewPath: null }),
    ).toBe('a.ts')
  })

  it('is the file the review shows: the requested one, else the first unsaved', () => {
    expect(
      activeTargetPath(baseline, { activePath: 'ide:review', drafts, reviewPath: 'b.ts' }),
    ).toBe('b.ts')
    expect(activeTargetPath(baseline, { activePath: 'ide:review', drafts, reviewPath: null })).toBe(
      'a.ts',
    )
  })

  it('stays on the file the review shows once it has no changes, and guesses none otherwise', () => {
    expect(
      activeTargetPath(baseline, { activePath: 'ide:review', drafts: {}, reviewPath: 'a.ts' }),
    ).toBe('a.ts')
    expect(
      activeTargetPath(baseline, { activePath: 'ide:review', drafts: {}, reviewPath: null }),
    ).toBeNull()
    expect(activeTargetPath(baseline, { activePath: null, drafts, reviewPath: null })).toBeNull()
  })
})
