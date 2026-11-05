import { describe, expect, it, vi } from 'vitest'
import { createDraftUndo } from '../ide/draft-undo'
import type { Drafts } from '../ide/drafts'
import { UNDO_TOAST_MS } from '../action-toast'

function setup(initial: Drafts) {
  const closed: string[] = []
  const opened: string[] = []
  let store = {
    drafts: initial,
    replaceDrafts: (d: Drafts) => void (store = { ...store, drafts: d }),
    closeFile: (p: string) => void closed.push(p),
    openFile: (p: string) => void opened.push(p),
  }
  const notify = { info: vi.fn() }
  const undo = createDraftUndo({ getStore: () => store, notify })
  const lastUndo = () => notify.info.mock.calls.at(-1)![1].action.onClick as () => void
  return { undo, notify, lastUndo, drafts: () => store.drafts, closed, opened, store: () => store }
}

const three: Drafts = {
  'a.ts': { source: 'A', baseHash: 'ha' },
  'b.ts': { source: 'B', baseHash: 'hb' },
  'lib/c.ts': { source: 'C', baseHash: 'hc' },
}

describe('discardAll', () => {
  it('drops every draft and offers a ten second Undo', () => {
    const t = setup(three)
    t.undo.discardAll()
    expect(t.drafts()).toEqual({})
    expect(t.notify.info).toHaveBeenCalledWith(
      'Discarded changes to 3 files.',
      expect.objectContaining({ duration: UNDO_TOAST_MS }),
    )
  })

  it('brings all three back on Undo', () => {
    const t = setup(three)
    t.undo.discardAll()
    t.lastUndo()()
    expect(t.drafts()).toEqual(three)
    expect(t.notify.info).toHaveBeenLastCalledWith('Brought back 3 files.')
  })

  it('brings back a file that moved on or vanished on the server, still on its old hash', () => {
    // The undo no longer looks at the server: b.ts and lib/c.ts may have changed or been deleted.
    const t = setup(three)
    t.undo.discardAll()
    t.lastUndo()()
    expect(t.drafts()).toEqual(three)
    expect(t.notify.info).toHaveBeenLastCalledWith('Brought back 3 files.')
  })

  it('keeps text typed after the discard and says which file', () => {
    const t = setup(three)
    t.undo.discardAll()
    const undo = t.lastUndo()
    t.store().replaceDrafts({ 'b.ts': { source: 'typed since', baseHash: 'hb' } })
    undo()
    expect(t.drafts()['b.ts']?.source).toBe('typed since')
    expect(Object.keys(t.drafts())).toEqual(['b.ts', 'a.ts', 'lib/c.ts'])
    expect(t.notify.info).toHaveBeenLastCalledWith(
      'Brought back 2 of 3 files.',
      expect.objectContaining({
        description: 'You’ve edited b.ts again since, so those edits were kept.',
      }),
    )
  })

  it('does nothing when nothing is unsaved', () => {
    const t = setup({})
    t.undo.discardAll()
    expect(t.notify.info).not.toHaveBeenCalled()
  })
})

describe('revertFile', () => {
  it('drops only that file and Undo puts it back', () => {
    const t = setup(three)
    t.undo.revertFile('b.ts')
    expect(Object.keys(t.drafts())).toEqual(['a.ts', 'lib/c.ts'])
    expect(t.notify.info).toHaveBeenCalledWith('Reverted b.ts.', expect.any(Object))
    t.lastUndo()()
    expect(t.drafts()['b.ts']).toEqual(three['b.ts'])
  })

  it('ignores a file without a draft', () => {
    const t = setup(three)
    t.undo.revertFile('zzz.ts')
    expect(t.notify.info).not.toHaveBeenCalled()
  })
})

describe('dispose', () => {
  it('refuses an Undo that outlived its workflow instead of applying it elsewhere', () => {
    const t = setup(three)
    t.undo.discardAll()
    const undo = t.lastUndo()
    t.undo.dispose()
    undo()
    expect(t.drafts()).toEqual({})
    expect(t.notify.info).toHaveBeenLastCalledWith('Can’t undo after leaving this workflow.')
  })
})

describe('takeServerVersion', () => {
  it('drops the draft with an Undo that brings it back as it was, even though the file moved on', () => {
    const t = setup(three)
    t.undo.takeServerVersion('a.ts', 'Switched a.ts to the server version.')
    expect(t.drafts()['a.ts']).toBeUndefined()
    expect(t.notify.info).toHaveBeenCalledWith(
      'Switched a.ts to the server version.',
      expect.objectContaining({ duration: UNDO_TOAST_MS }),
    )
    t.lastUndo()()
    // Back with its old base hash: it shows as changed on the server again.
    expect(t.drafts()['a.ts']).toEqual({ source: 'A', baseHash: 'ha' })
  })

  it('does not overwrite text typed after the switch', () => {
    const t = setup(three)
    t.undo.takeServerVersion('a.ts', 'Switched.')
    const undo = t.lastUndo()
    t.store().replaceDrafts({ ...t.drafts(), 'a.ts': { source: 'typed since', baseHash: 'ha' } })
    undo()
    expect(t.drafts()['a.ts']?.source).toBe('typed since')
    expect(t.notify.info).toHaveBeenLastCalledWith(
      'Couldn’t bring back a.ts.',
      expect.objectContaining({ description: 'You’ve edited it again since.' }),
    )
  })

  it('does nothing for a file with no draft', () => {
    const t = setup(three)
    t.undo.takeServerVersion('zzz.ts', 'Switched.')
    expect(t.notify.info).not.toHaveBeenCalled()
  })

  it('refuses to undo into another workflow after dispose', () => {
    const t = setup(three)
    t.undo.takeServerVersion('a.ts', 'Switched.')
    const undo = t.lastUndo()
    t.undo.dispose()
    undo()
    expect(t.drafts()['a.ts']).toBeUndefined()
    expect(t.notify.info).toHaveBeenLastCalledWith('Can’t undo after leaving this workflow.')
  })
})

describe('discardDeleted', () => {
  it('drops the draft and closes the tab; Undo brings both back', () => {
    const t = setup({ 'gone.ts': { source: 'mine', baseHash: 'hg' } })
    t.undo.discardDeleted('gone.ts')
    expect(t.drafts()).toEqual({})
    expect(t.closed).toEqual(['gone.ts', 'ide:compare:gone.ts'])
    t.lastUndo()()
    expect(t.drafts()['gone.ts']).toEqual({ source: 'mine', baseHash: 'hg' })
    expect(t.opened).toEqual(['gone.ts'])
  })
})
