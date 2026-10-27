import { describe, expect, it } from 'vitest'
import { searchForTab } from '../tab-search'

describe('searchForTab', () => {
  it('keeps the dev params and the tab, never a dialog param', () => {
    expect(
      searchForTab({ mock: 'viewer', as: 'priya', new: 'key' } as never, 'variables', 'general'),
    ).toEqual({ mock: 'viewer', as: 'priya', tab: 'variables' })
  })

  it('leaves the tab out for the one the bare URL opens', () => {
    expect(searchForTab({}, 'general', 'general')).toEqual({
      mock: undefined,
      as: undefined,
      tab: undefined,
    })
    expect(searchForTab({ tab: 'variables' }, 'nodes', 'nodes').tab).toBeUndefined()
  })
})
