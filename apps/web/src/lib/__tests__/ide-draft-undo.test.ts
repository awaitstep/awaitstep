import { describe, expect, it, vi } from 'vitest'
import { createDraftUndo } from '../ide/draft-undo'
import type { Drafts } from '../ide/drafts'
import { UNDO_TOAST_MS } from '../action-toast'

function setup(initial: Drafts, baselineHashes: Record<string, string>) {
  let store = {
    drafts: initial,
    replaceDrafts: (d: Drafts) => void (store = { ...store, drafts: d }),
  }
  const notify = { info: vi.fn() }
  const baseline = () => new Map(Object.entries(baselineHashes).map(([p, hash]) => [p, { hash }]))
  const undo = createDraftUndo({ getStore: () => store, getBaseline: baseline, notify })
  const lastUndo = () => notify.info.mock.calls.at(-1)![1].action.onClick as () => void
  return { undo, notify, lastUndo, drafts: () => store.drafts }
}

const three: Drafts = {
  'a.ts': { source: 'A', baseHash: 'ha' },
  'b.ts': { source: 'B', baseHash: 'hb' },
  'lib/c.ts': { source: 'C', baseHash: 'hc' },
}
const hashes = { 'a.ts': 'ha', 'b.ts': 'hb', 'lib/c.ts': 'hc' }

describe('discardAll', () => {
  it('drops every draft and offers a ten second Undo', () => {
    const t = setup(three, hashes)
    t.undo.discardAll()
    expect(t.drafts()).toEqual({})
    expect(t.notify.info).toHaveBeenCalledWith(
      'Discarded changes to 3 files.',
      expect.objectContaining({ duration: UNDO_TOAST_MS }),
    )
  })

  it('brings all three back on Undo', () => {
    const t = setup(three, hashes)
    t.undo.discardAll()
    t.lastUndo()()
    expect(t.drafts()).toEqual(three)
    expect(t.notify.info).toHaveBeenLastCalledWith('Brought back 3 files.')
  })

  it('skips a file that changed on the server meanwhile and says so', () => {
    const t = setup(three, { ...hashes, 'b.ts': 'hb-new' })
    t.undo.discardAll()
    t.lastUndo()()
    expect(Object.keys(t.drafts())).toEqual(['a.ts', 'lib/c.ts'])
    expect(t.notify.info).toHaveBeenLastCalledWith(
      'Brought back 2 of 3 files.',
      expect.objectContaining({ description: expect.stringContaining('b.ts was changed') }),
    )
  })

  it('does nothing when nothing is unsaved', () => {
    const t = setup({}, {})
    t.undo.discardAll()
    expect(t.notify.info).not.toHaveBeenCalled()
  })
})

describe('revertFile', () => {
  it('drops only that file and Undo puts it back', () => {
    const t = setup(three, hashes)
    t.undo.revertFile('b.ts')
    expect(Object.keys(t.drafts())).toEqual(['a.ts', 'lib/c.ts'])
    expect(t.notify.info).toHaveBeenCalledWith('Reverted b.ts.', expect.any(Object))
    t.lastUndo()()
    expect(t.drafts()['b.ts']).toEqual(three['b.ts'])
  })

  it('ignores a file without a draft', () => {
    const t = setup(three, hashes)
    t.undo.revertFile('zzz.ts')
    expect(t.notify.info).not.toHaveBeenCalled()
  })
})

describe('dispose', () => {
  it('refuses an Undo that outlived its workflow instead of applying it elsewhere', () => {
    const t = setup(three, hashes)
    t.undo.discardAll()
    const undo = t.lastUndo()
    t.undo.dispose()
    undo()
    expect(t.drafts()).toEqual({})
    expect(t.notify.info).toHaveBeenLastCalledWith('Can’t undo after leaving this workflow.')
  })
})
