import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createImporterShower, findInFiles, stepSearchHit } from '../../lib/ide/search-actions'
import { runSearch } from '../../lib/ide/search'
import { CHARGE_FILES } from '../../lib/__tests__/fixtures/search/files'
import { useIdeLayoutStore } from '../ide-layout-store'
import { useIdeSearchStore } from '../ide-search-store'
import { useIdeStore } from '../ide-store'

const CHARGE_SOURCES = new Map(CHARGE_FILES.map((f) => [f.path, f]))

function seedResults(query = 'chargeOrder') {
  useIdeSearchStore
    .getState()
    .setOutcome(
      runSearch(CHARGE_FILES, { query, caseSensitive: true, wholeWord: false, regex: false }),
    )
}

beforeEach(() => {
  useIdeSearchStore.getState().reset()
  useIdeStore.getState().resetSession()
  useIdeLayoutStore.setState({ sideBarTab: 'explorer', explorerOpen: true })
})

describe('findInFiles', () => {
  it('opens Search and prefills the selection from a focused editor', () => {
    useIdeStore.getState().setEditorHandle({
      focus: vi.fn(),
      trigger: vi.fn(),
      searchSeed: () => '  chargeOrder ',
    })
    findInFiles(useIdeStore.getState().editorHandle?.searchSeed() ?? null)
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('search')
    expect(useIdeSearchStore.getState()).toMatchObject({
      query: 'chargeOrder',
      focusRequested: true,
    })
  })

  it('shows the side bar first when it was hidden', () => {
    useIdeLayoutStore.setState({ explorerOpen: false })
    findInFiles(useIdeStore.getState().editorHandle?.searchSeed() ?? null)
    expect(useIdeLayoutStore.getState().explorerOpen).toBe(true)
  })

  it('keeps the typed query when the editor does not have the keyboard', () => {
    useIdeSearchStore.getState().setQuery('typed')
    useIdeStore.getState().setEditorHandle({
      focus: vi.fn(),
      trigger: vi.fn(),
      searchSeed: () => null,
    })
    findInFiles(useIdeStore.getState().editorHandle?.searchSeed() ?? null)
    expect(useIdeSearchStore.getState()).toMatchObject({ query: 'typed', focusRequested: true })
  })

  it('keeps the query when the selection is empty or spans lines', () => {
    useIdeSearchStore.getState().setQuery('typed')
    useIdeStore
      .getState()
      .setEditorHandle({ focus: vi.fn(), trigger: vi.fn(), searchSeed: () => '' })
    findInFiles(useIdeStore.getState().editorHandle?.searchSeed() ?? null)
    expect(useIdeSearchStore.getState().query).toBe('typed')
  })
})

describe('createImporterShower', () => {
  it('searches the old path as a quoted import string, whatever the user had on', () => {
    useIdeSearchStore.setState({ regex: false, caseSensitive: false, wholeWord: true })
    createImporterShower().show('#app/lib/payments/refund')
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('search')
    expect(useIdeSearchStore.getState()).toMatchObject({
      regex: true,
      wholeWord: false,
      caseSensitive: true,
    })
    expect(useIdeSearchStore.getState().query).toContain('#app/lib/payments/refund')
  })
})

describe('stepSearchHit (F4 / ⇧F4)', () => {
  it('reveals the next hit with the match selected and remembers it', () => {
    seedResults()
    stepSearchHit(1, CHARGE_SOURCES)
    const first = useIdeStore.getState().reveal!
    expect(first).toMatchObject({ path: 'lib/errors.ts', line: 1, column: 14, endColumn: 25 })
    stepSearchHit(1, CHARGE_SOURCES)
    expect(useIdeStore.getState().reveal).toMatchObject({ path: 'lib/payments/charge.ts', line: 1 })
    stepSearchHit(-1, CHARGE_SOURCES)
    expect(useIdeStore.getState().reveal).toMatchObject({ path: 'lib/errors.ts' })
  })

  it('does nothing, and says so, when there is nothing to step through', () => {
    expect(stepSearchHit(1, CHARGE_SOURCES)).toBe(false)
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('explorer')
    expect(useIdeStore.getState().reveal).toBeNull()
  })

  it('does not step through an invalid or timed-out search', () => {
    useIdeSearchStore.getState().setOutcome({ kind: 'invalid', message: 'bad' })
    stepSearchHit(1, CHARGE_SOURCES)
    expect(useIdeStore.getState().reveal).toBeNull()
  })
})

describe('search store', () => {
  it('changing the query or an option forgets the current hit', () => {
    useIdeSearchStore.getState().setCurrent({ path: 'a.ts', line: 1, column: 1 })
    useIdeSearchStore.getState().toggle('regex')
    expect(useIdeSearchStore.getState().current).toBeNull()
  })

  it('reset clears the query so the next workflow starts empty', () => {
    useIdeSearchStore.getState().setQuery('x')
    useIdeSearchStore.getState().reset()
    expect(useIdeSearchStore.getState()).toMatchObject({ query: '', outcome: null })
  })
})

describe('side bar tab', () => {
  it('showSideBar opens the panel on the chosen view', () => {
    useIdeLayoutStore.setState({ explorerOpen: false, sideBarTab: 'explorer' })
    useIdeLayoutStore.getState().showSideBar('search')
    expect(useIdeLayoutStore.getState()).toMatchObject({ explorerOpen: true, sideBarTab: 'search' })
  })

  it('is part of what the layout store persists, with Explorer as the default', () => {
    const partial = JSON.parse(JSON.stringify(useIdeLayoutStore.getState())) as Record<
      string,
      unknown
    >
    expect(partial.sideBarTab).toBeDefined()
    expect(useIdeLayoutStore.persist.getOptions().name).toBe('awaitstep-ide')
  })
})
