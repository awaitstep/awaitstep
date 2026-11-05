import { beforeEach, describe, expect, it } from 'vitest'
import { runSearch, type SearchFile, type SearchResults } from '../ide/search'
import { createImporterShower, findInFiles, showSearch, stepSearchHit } from '../ide/search-actions'
import { currentHits } from '../ide/search-results'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { useIdeStore } from '../../stores/ide-store'

const files: SearchFile[] = [
  { path: 'a.ts', generated: false, source: 'needle one\nneedle two' },
  { path: 'b.ts', generated: false, source: 'a needle' },
]
const sources = (list: readonly SearchFile[]) => new Map(list.map((f) => [f.path, f]))

function resultsFor(list: readonly SearchFile[]): SearchResults {
  const outcome = runSearch(list, {
    query: 'needle',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  })
  if (outcome.kind !== 'results') throw new Error('expected results')
  return outcome.results
}

beforeEach(() => {
  useIdeSearchStore.getState().reset()
  useIdeStore.getState().resetSession()
  useIdeLayoutStore.setState({ sideBarTab: 'explorer', explorerOpen: false })
})

describe('findInFiles', () => {
  it('escapes the selection when regex mode is on, so chargeOrder( is not a bad pattern', () => {
    useIdeSearchStore.setState({ regex: true })
    findInFiles('chargeOrder(')
    expect(useIdeSearchStore.getState().query).toBe('chargeOrder\\(')
  })

  it('uses the selection as it is in plain mode', () => {
    findInFiles('chargeOrder(')
    expect(useIdeSearchStore.getState().query).toBe('chargeOrder(')
  })

  it('keeps the typed query and asks for focus when there is no seed', () => {
    useIdeSearchStore.setState({ query: 'typed' })
    findInFiles(null)
    const state = useIdeSearchStore.getState()
    expect(state.query).toBe('typed')
    expect(state.focusRequested).toBe(true)
    expect(useIdeLayoutStore.getState()).toMatchObject({ sideBarTab: 'search', explorerOpen: true })
  })
})

describe('createImporterShower', () => {
  it('searches your files for the old path, even with generated files switched on', () => {
    useIdeSearchStore.setState({ includeGenerated: true })
    createImporterShower().show('#app/lib/x')
    expect(useIdeSearchStore.getState()).toMatchObject({ includeGenerated: false, regex: true })
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('search')
  })

  it('does nothing once the workspace is gone', () => {
    const shower = createImporterShower()
    shower.dispose()
    shower.show('#app/lib/x')
    expect(useIdeSearchStore.getState().query).toBe('')
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('explorer')
  })
})

describe('stepSearchHit', () => {
  it('opens the next hit, wrapping', () => {
    useIdeSearchStore.getState().setOutcome({ kind: 'results', results: resultsFor(files) })
    expect(stepSearchHit(1, sources(files))).toBe(true)
    expect(useIdeStore.getState().reveal).toMatchObject({ path: 'a.ts', line: 1 })
  })

  it('does not reveal a file that was deleted or renamed away', () => {
    useIdeSearchStore.getState().setOutcome({ kind: 'results', results: resultsFor(files) })
    expect(stepSearchHit(1, sources([files[1]!]))).toBe(true)
    expect(useIdeStore.getState().reveal?.path).toBe('b.ts')
    useIdeStore.getState().resetSession()
    expect(stepSearchHit(1, sources([]))).toBe(false)
    expect(useIdeStore.getState().reveal).toBeNull()
    expect(useIdeStore.getState().activePath).toBeNull()
  })

  it('skips hits the edit moved away', () => {
    useIdeSearchStore.getState().setOutcome({ kind: 'results', results: resultsFor(files) })
    const edited = [{ ...files[0]!, source: 'changed\nneedle two' }, files[1]!]
    stepSearchHit(1, sources(edited))
    expect(useIdeStore.getState().reveal).toMatchObject({ path: 'a.ts', line: 2 })
  })

  it('does nothing, and keeps the query, with no usable results', () => {
    useIdeSearchStore.setState({ query: 'typed', outcome: { kind: 'timeout' } })
    expect(stepSearchHit(1, sources(files))).toBe(false)
    useIdeSearchStore.setState({ outcome: { kind: 'invalid', message: 'x' } })
    expect(stepSearchHit(-1, sources(files))).toBe(false)
    expect(useIdeSearchStore.getState().query).toBe('typed')
    expect(useIdeStore.getState().reveal).toBeNull()
  })
})

describe('showSearch', () => {
  it('shows Search and asks for focus without touching the query', () => {
    useIdeSearchStore.setState({ query: 'typed' })
    showSearch()
    expect(useIdeSearchStore.getState()).toMatchObject({ query: 'typed', focusRequested: true })
  })
})

describe('currentHits', () => {
  it('drops hits whose line no longer holds the match and files that are gone', () => {
    const narrowed = currentHits(
      resultsFor(files),
      sources([{ ...files[0]!, source: 'needle one\nchanged' }]),
    )
    expect(narrowed.files.map((f) => [f.path, f.hits.length])).toEqual([['a.ts', 1]])
    expect(narrowed.total).toBe(1)
  })
})
