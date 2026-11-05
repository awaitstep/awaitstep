import { describe, expect, it } from 'vitest'
import {
  EMPTY_TABS,
  closeAllTabs,
  closeTab,
  closeTabs,
  REVIEW_TAB_ID,
  compareTabId,
  compareTabPath,
  filePathOfTab,
  tabKind,
  nextTabIndex,
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

describe('closeTabs', () => {
  it('closes several tabs and lands on the neighbour rule for the active one', () => {
    expect(closeTabs(three, ['b.ts', 'c.ts'])).toEqual({ openPaths: ['a.ts'], activePath: 'a.ts' })
  })

  it('leaves the state alone for paths that are not open', () => {
    expect(closeTabs(three, ['zzz.ts'])).toEqual(three)
  })
})

describe('nextTabIndex', () => {
  it('steps with the arrows and wraps', () => {
    expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1)
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0)
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2)
  })

  it('jumps to the ends', () => {
    expect(nextTabIndex('Home', 2, 3)).toBe(0)
    expect(nextTabIndex('End', 0, 3)).toBe(2)
  })

  it('ignores other keys and a lone tab', () => {
    expect(nextTabIndex('a', 0, 3)).toBeNull()
    expect(nextTabIndex('ArrowRight', 0, 1)).toBeNull()
    expect(nextTabIndex('ArrowRight', -1, 3)).toBeNull()
  })
})

describe('review and Compare tabs', () => {
  it('have ids no project path can have (paths never contain a colon)', () => {
    expect(REVIEW_TAB_ID).toContain(':')
    expect(compareTabId('lib/a.ts')).toContain(':')
    expect(compareTabId('lib/a.ts')).not.toBe(compareTabId('lib/b.ts'))
  })

  it('tells files, the review and Compare tabs apart', () => {
    expect(tabKind('lib/a.ts')).toBe('file')
    expect(tabKind(REVIEW_TAB_ID)).toBe('review')
    expect(tabKind(compareTabId('lib/a.ts'))).toBe('compare')
    expect(compareTabPath(compareTabId('lib/a.ts'))).toBe('lib/a.ts')
    expect(compareTabPath('lib/a.ts')).toBeNull()
    expect(filePathOfTab('lib/a.ts')).toBe('lib/a.ts')
    expect(filePathOfTab(REVIEW_TAB_ID)).toBeNull()
    expect(filePathOfTab(compareTabId('lib/a.ts'))).toBeNull()
    expect(filePathOfTab(null)).toBeNull()
  })

  it('prune keeps the review tab and a Compare tab whose file still has an unsaved copy', () => {
    const state: TabState = {
      openPaths: ['a.ts', REVIEW_TAB_ID, compareTabId('a.ts')],
      activePath: REVIEW_TAB_ID,
    }
    const next = pruneTabs(state, new Set(['a.ts']), new Set(['a.ts']))
    expect(next.openPaths).toEqual(state.openPaths)
  })

  it('prune closes a Compare tab once its file has no unsaved copy, or no longer exists', () => {
    const state: TabState = {
      openPaths: ['a.ts', 'b.ts', compareTabId('a.ts'), compareTabId('b.ts')],
      activePath: compareTabId('a.ts'),
    }
    const next = pruneTabs(state, new Set(['a.ts']), new Set(['b.ts']))
    expect(next.openPaths).toEqual(['a.ts'])
    expect(next.activePath).toBe('a.ts')
  })

  it('prune without drafts leaves Compare tabs for existing files alone', () => {
    const state: TabState = { openPaths: [compareTabId('a.ts')], activePath: compareTabId('a.ts') }
    expect(pruneTabs(state, new Set(['a.ts'])).openPaths).toEqual([compareTabId('a.ts')])
  })
})
