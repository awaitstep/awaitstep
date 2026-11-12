import { describe, expect, it } from 'vitest'
import { diffTotals, diffVersions } from '../version-diff'

describe('diffVersions', () => {
  it('lists only the files that differ, with their line changes and counts', () => {
    const diffs = diffVersions(
      [
        { path: 'index.ts', source: 'a\nb\nc\n' },
        { path: 'same.ts', source: 'x\n' },
        { path: 'gone.ts', source: 'old\n' },
      ],
      [
        { path: 'index.ts', source: 'a\nB\nc\nd\n' },
        { path: 'same.ts', source: 'x\n' },
        { path: 'new.ts', source: 'n1\nn2\n' },
      ],
    )
    expect(diffs.map((d) => [d.path, d.status, d.added, d.removed])).toEqual([
      ['gone.ts', 'removed', 0, 1],
      ['index.ts', 'changed', 2, 1],
      ['new.ts', 'added', 2, 0],
    ])
    expect(diffs[1]!.lines).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ])
    expect(diffTotals(diffs)).toEqual({ added: 4, removed: 2 })
  })
})
