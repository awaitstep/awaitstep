import { describe, expect, it } from 'vitest'
import { dataSourceFor, mockSourceAllowed, validateDashboardSearch } from '../dashboard-providers'

describe('dataSourceFor', () => {
  it('is the API unless the URL asks for a dummy scenario or a sample person', () => {
    expect(dataSourceFor({}, true)).toBe('api')
    expect(dataSourceFor({ mock: 'loading' }, true)).toBe('mock')
    expect(dataSourceFor({ as: 'priya' }, true)).toBe('mock')
  })

  it('ignores ?mock= and ?as= when the dummy source is not allowed, as in a production build', () => {
    expect(dataSourceFor({ mock: 'loading' }, false)).toBe('api')
    expect(dataSourceFor({ as: 'priya' }, false)).toBe('api')
    expect(dataSourceFor({ mock: 'empty', as: 'priya' }, false)).toBe('api')
  })
})

describe('mockSourceAllowed', () => {
  it('is off only for a production build, whatever NODE_ENV says', () => {
    expect(mockSourceAllowed('production')).toBe(false)
    expect(mockSourceAllowed('development')).toBe(true)
    expect(mockSourceAllowed('test')).toBe(true)
  })
})

describe('validateDashboardSearch and the dummy source', () => {
  it('keeps ?mock= and ?as= where the dummy source is allowed', () => {
    expect(validateDashboardSearch({ mock: 'empty', as: 'priya' }, true)).toMatchObject({
      mock: 'empty',
      as: 'priya',
    })
  })

  it('drops them where it is not, so they are not carried between pages', () => {
    const search = validateDashboardSearch({ mock: 'empty', as: 'priya', open: 'inbox' }, false)
    expect(search.mock).toBeUndefined()
    expect(search.as).toBeUndefined()
    expect(search.open).toBe('inbox')
  })
})
