import { describe, expect, it } from 'vitest'
import type { Drafts } from '../ide/drafts'
import {
  deletedOutsideFiles,
  deletedOutsidePaths,
  diffAgainstListing,
  diffSignature,
  outsidePaths,
  outsideState,
  planRefresh,
} from '../ide/outside-changes'
import { useIdeStore } from '../../stores/ide-store'

const baseline = new Map<string, { hash?: string }>([
  ['worker.ts', {}], // generated: no hash
  ['lib/a.ts', { hash: 'ha' }],
  ['lib/b.ts', { hash: 'hb' }],
  ['handlers.ts', {}], // virtual seed
])

describe('diffAgainstListing', () => {
  it('is empty when every stored file has the hash it was loaded with', () => {
    const listing = [
      { path: 'lib/a.ts', hash: 'ha' },
      { path: 'lib/b.ts', hash: 'hb' },
    ]
    expect(diffAgainstListing(baseline, listing)).toEqual({ changed: [], deleted: [], added: [] })
  })

  it('names changed, deleted and added files, and ignores generated files and seeds', () => {
    const listing = [
      { path: 'lib/a.ts', hash: 'ha2' },
      { path: 'lib/new.ts', hash: 'hn' },
    ]
    expect(diffAgainstListing(baseline, listing)).toEqual({
      changed: ['lib/a.ts'],
      deleted: ['lib/b.ts'],
      added: ['lib/new.ts'],
    })
  })

  it('counts a seed that an agent stored meanwhile as added', () => {
    const diff = diffAgainstListing(baseline, [
      { path: 'lib/a.ts', hash: 'ha' },
      { path: 'lib/b.ts', hash: 'hb' },
      { path: 'handlers.ts', hash: 'hh' },
    ])
    expect(diff.added).toEqual(['handlers.ts'])
  })
})

describe('planRefresh', () => {
  const listing = [
    { path: 'lib/a.ts', hash: 'ha2' },
    { path: 'lib/b.ts', hash: 'hb' },
  ]

  it('does nothing when the listing agrees with what is loaded', () => {
    const agree = [
      { path: 'lib/a.ts', hash: 'ha' },
      { path: 'lib/b.ts', hash: 'hb' },
    ]
    expect(planRefresh(baseline, agree, 'old')).toEqual({ refetch: false, signature: null })
  })

  it('refetches once for a discrepancy, then not again while it persists', () => {
    const first = planRefresh(baseline, listing, null)
    expect(first.refetch).toBe(true)
    expect(planRefresh(baseline, listing, first.signature)).toEqual({
      refetch: false,
      signature: first.signature,
    })
  })

  it('refetches again when the file changes once more', () => {
    const first = planRefresh(baseline, listing, null)
    const later = [
      { path: 'lib/a.ts', hash: 'ha3' },
      { path: 'lib/b.ts', hash: 'hb' },
    ]
    expect(planRefresh(baseline, later, first.signature).refetch).toBe(true)
  })

  it('a signature depends on the hashes, not only the paths', () => {
    const diff = { changed: ['lib/a.ts'], deleted: [], added: [] }
    expect(diffSignature(diff, [{ path: 'lib/a.ts', hash: '1' }])).not.toBe(
      diffSignature(diff, [{ path: 'lib/a.ts', hash: '2' }]),
    )
  })
})

describe('outsideState', () => {
  it('is null for a file without a draft', () => {
    expect(outsideState(baseline, 'lib/a.ts', undefined)).toBeNull()
  })

  it('is null while the draft still builds on the current hash', () => {
    expect(outsideState(baseline, 'lib/a.ts', { source: 'x', baseHash: 'ha' })).toBeNull()
  })

  it('is changed when the draft started from an older hash', () => {
    expect(outsideState(baseline, 'lib/a.ts', { source: 'x', baseHash: 'old' })).toBe('changed')
  })

  it('is changed for a draft of a seed that is now stored', () => {
    const stored = new Map([['handlers.ts', { hash: 'hh' }]])
    expect(outsideState(stored, 'handlers.ts', { source: 'x', baseHash: null })).toBe('changed')
  })

  it('is deleted when the file is gone but the draft started from a stored one', () => {
    expect(outsideState(baseline, 'lib/gone.ts', { source: 'x', baseHash: 'hg' })).toBe('deleted')
  })

  it('is null for a draft of a file that was never stored', () => {
    expect(outsideState(baseline, 'lib/new.ts', { source: 'x', baseHash: null })).toBeNull()
  })
})

describe('deleted files with unsaved edits', () => {
  const drafts: Drafts = {
    'lib/a.ts': { source: 'edited', baseHash: 'ha' },
    'lib/gone.ts': { source: 'mine', baseHash: 'hg' },
    'lib/unstored.ts': { source: 'new', baseHash: null },
  }

  it('lists only drafts of stored files that vanished', () => {
    expect(deletedOutsidePaths(baseline, drafts)).toEqual(['lib/gone.ts'])
  })

  it('turns them into project files carrying the unsaved text', () => {
    expect(deletedOutsideFiles(baseline, drafts)).toEqual([
      { path: 'lib/gone.ts', source: 'mine', role: 'module' },
    ])
  })

  it('splits every moved-on draft into changed and deleted', () => {
    const moved: Drafts = {
      ...drafts,
      'lib/b.ts': { source: 'edited b', baseHash: 'older' },
    }
    expect(outsidePaths(baseline, moved)).toEqual({
      changed: ['lib/b.ts'],
      deleted: ['lib/gone.ts'],
    })
  })

  it('regression: pruning the tabs with the deleted file kept in the set leaves its tab open', () => {
    const store = useIdeStore.getState()
    store.resetSession()
    store.openFile('lib/gone.ts')
    store.setDraft('lib/gone.ts', 'mine', 'hg')
    const ghosts = deletedOutsidePaths(baseline, useIdeStore.getState().drafts)
    useIdeStore.getState().pruneFiles([...baseline.keys(), ...ghosts])
    expect(useIdeStore.getState().openPaths).toContain('lib/gone.ts')
    // Without the ghost the old behaviour closed the tab and left the draft unseen but counted.
    useIdeStore.getState().pruneFiles([...baseline.keys()])
    expect(useIdeStore.getState().openPaths).not.toContain('lib/gone.ts')
    expect(useIdeStore.getState().drafts['lib/gone.ts']).toBeDefined()
  })
})
