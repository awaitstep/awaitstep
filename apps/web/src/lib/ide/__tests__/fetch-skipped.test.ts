import { describe, expect, it } from 'vitest'
import { fetchHandlerSkipped } from '../fetch-skipped'

describe('fetchHandlerSkipped', () => {
  it('is said for a workflow live only where its URL can’t be reached', () => {
    expect(fetchHandlerSkipped('workflow', [{ callable: false }])).toBe(true)
  })

  it('is not said once one account has a URL of its own', () => {
    expect(fetchHandlerSkipped('workflow', [{ callable: false }, { callable: true }])).toBe(false)
  })

  it('is not said before any deploy, nor for a function', () => {
    expect(fetchHandlerSkipped('workflow', [])).toBe(false)
    expect(fetchHandlerSkipped('script', [{ callable: false }])).toBe(false)
  })
})
