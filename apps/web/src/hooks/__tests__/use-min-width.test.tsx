import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMinWidth } from '../use-min-width'

function stubMatchMedia(matches: boolean) {
  const add = vi.fn()
  const remove = vi.fn()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches, addEventListener: add, removeEventListener: remove })),
  )
  return { add, remove }
}

describe('useMinWidth', () => {
  it('reports whether the window is wide enough', () => {
    stubMatchMedia(false)
    expect(renderHook(() => useMinWidth(960)).result.current).toBe(false)
    stubMatchMedia(true)
    expect(renderHook(() => useMinWidth(960)).result.current).toBe(true)
  })

  it('subscribes once, not on every render', () => {
    const { add } = stubMatchMedia(true)
    const { rerender } = renderHook(() => useMinWidth(960))
    rerender()
    rerender()
    expect(add).toHaveBeenCalledTimes(1)
  })
})
