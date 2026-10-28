import { describe, expect, it } from 'vitest'
import { dataSourceFor } from '../dashboard-providers'

describe('dataSourceFor', () => {
  it('is the API unless the URL asks for a dummy scenario or a sample person', () => {
    expect(dataSourceFor({})).toBe('api')
    expect(dataSourceFor({ mock: 'loading' })).toBe('mock')
    expect(dataSourceFor({ as: 'priya' })).toBe('mock')
  })
})
