import { describe, expect, it } from 'vitest'
import { pickWorkspace } from '../scope-memory'

describe('pickWorkspace', () => {
  it('lands in the most recent workspace that can still be opened', () => {
    expect(pickWorkspace(['sales', 'it'], ['it', 'sales'])).toBe('it')
  })

  it('skips recent slugs that are gone or hidden', () => {
    expect(pickWorkspace(['sales', 'it'], ['old-ws', 'sales'])).toBe('sales')
    expect(pickWorkspace(['sales', 'it'], ['finance'])).toBe('sales')
  })

  it('takes the first when nothing is remembered, and none when there are none', () => {
    expect(pickWorkspace(['sales', 'it'], [])).toBe('sales')
    expect(pickWorkspace([], [])).toBeNull()
  })
})
