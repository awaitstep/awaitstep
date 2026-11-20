import { describe, expect, it } from 'vitest'
import { searchForTab } from '../tab-search'

describe('searchForTab', () => {
  it('keeps only the tab, never a dialog param', () => {
    expect(searchForTab('variables', 'general')).toEqual({ tab: 'variables' })
  })

  it('leaves the tab out for the one the bare URL opens', () => {
    expect(searchForTab('general', 'general')).toEqual({ tab: undefined })
    expect(searchForTab('nodes', 'nodes').tab).toBeUndefined()
  })
})
