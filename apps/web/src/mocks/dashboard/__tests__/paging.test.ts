import { describe, expect, it } from 'vitest'
import { pageOf } from '../server/paging'

const LIST = Array.from({ length: 60 }, (_, i) => i)

describe('pageOf', () => {
  it('serves 25 by default and points at the next page', () => {
    const first = pageOf(LIST, {})
    expect(first.page).toEqual(LIST.slice(0, 25))
    expect(first.nextCursor).toBe('25')
    const last = pageOf(LIST, { cursor: '50' })
    expect(last.page).toEqual(LIST.slice(50))
    expect(last.nextCursor).toBeNull()
  })

  it('keeps the limit between 1 and 100', () => {
    expect(pageOf(LIST, { limit: 0 }).page).toHaveLength(1)
    expect(pageOf(Array.from({ length: 300 }), { limit: 500 }).page).toHaveLength(100)
  })

  it('refuses a cursor that isn’t a page offset', () => {
    expect(() => pageOf(LIST, { cursor: 'abc' })).toThrow('That page no longer exists')
    expect(() => pageOf(LIST, { cursor: '-5' })).toThrow('That page no longer exists')
    expect(() => pageOf(LIST, { cursor: '2.5' })).toThrow('That page no longer exists')
  })
})
