import { describe, expect, it, vi } from 'vitest'
import { focusPageSearch } from '../page-search'

function field(shown: boolean) {
  return {
    getClientRects: () => ({ length: shown ? 1 : 0 }),
    focus: vi.fn(),
    select: vi.fn(),
  }
}

function root(fields: ReturnType<typeof field>[]): ParentNode {
  return { querySelectorAll: () => fields } as unknown as ParentNode
}

describe('focusPageSearch', () => {
  it('focuses and selects the first shown search, skipping hidden copies', () => {
    const hidden = field(false)
    const shown = field(true)
    expect(focusPageSearch(root([hidden, shown]))).toBe(true)
    expect(hidden.focus).not.toHaveBeenCalled()
    expect(shown.focus).toHaveBeenCalled()
    expect(shown.select).toHaveBeenCalled()
  })

  it('reports false when the page has no search, leaving / to the browser', () => {
    expect(focusPageSearch(root([field(false)]))).toBe(false)
  })
})
