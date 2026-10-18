import { describe, expect, it } from 'vitest'
import {
  EMPTY_TABS,
  closeAllTabs,
  closeTab,
  cycleTab,
  openTab,
  pruneTabs,
  type TabState,
} from '../ide/tabs'

const three: TabState = { openPaths: ['a.ts', 'b.ts', 'c.ts'], activePath: 'b.ts' }

describe('openTab', () => {
  it('appends new files and activates them', () => {
    expect(openTab(EMPTY_TABS, 'a.ts')).toEqual({ openPaths: ['a.ts'], activePath: 'a.ts' })
    expect(openTab(three, 'd.ts')).toEqual({
      openPaths: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      activePath: 'd.ts',
    })
  })

  it('re-activates an already open file without duplicating its tab', () => {
    expect(openTab(three, 'a.ts')).toEqual({ ...three, activePath: 'a.ts' })
  })
})

describe('closeTab', () => {
  it('moves focus to the right neighbour when the active tab closes', () => {
    expect(closeTab(three, 'b.ts')).toEqual({ openPaths: ['a.ts', 'c.ts'], activePath: 'c.ts' })
  })

  it('falls back to the left neighbour when the last tab closes', () => {
    expect(closeTab({ ...three, activePath: 'c.ts' }, 'c.ts')).toEqual({
      openPaths: ['a.ts', 'b.ts'],
      activePath: 'b.ts',
    })
  })

  it('keeps the active tab when another tab closes', () => {
    expect(closeTab(three, 'a.ts')).toEqual({ openPaths: ['b.ts', 'c.ts'], activePath: 'b.ts' })
  })

  it('leaves nothing active when the only tab closes and ignores unknown paths', () => {
    expect(closeTab({ openPaths: ['a.ts'], activePath: 'a.ts' }, 'a.ts')).toEqual(EMPTY_TABS)
    expect(closeTab(three, 'zzz.ts')).toBe(three)
  })
})

describe('closeAllTabs', () => {
  it('empties the strip', () => {
    expect(closeAllTabs()).toEqual(EMPTY_TABS)
  })
})

describe('cycleTab', () => {
  it('wraps in both directions', () => {
    expect(cycleTab(three, 1).activePath).toBe('c.ts')
    expect(cycleTab({ ...three, activePath: 'c.ts' }, 1).activePath).toBe('a.ts')
    expect(cycleTab({ ...three, activePath: 'a.ts' }, -1).activePath).toBe('c.ts')
  })

  it('is a no-op with fewer than two tabs or nothing active', () => {
    const single = { openPaths: ['a.ts'], activePath: 'a.ts' }
    expect(cycleTab(single, 1)).toBe(single)
    expect(cycleTab({ ...three, activePath: null }, 1).activePath).toBeNull()
  })
})

describe('pruneTabs', () => {
  it('drops vanished files and re-targets activation like sequential closes', () => {
    const pruned = pruneTabs(three, new Set(['a.ts', 'c.ts']))
    expect(pruned).toEqual({ openPaths: ['a.ts', 'c.ts'], activePath: 'c.ts' })
  })

  it('returns the same state when every tab still exists', () => {
    expect(pruneTabs(three, new Set(three.openPaths))).toBe(three)
  })
})
