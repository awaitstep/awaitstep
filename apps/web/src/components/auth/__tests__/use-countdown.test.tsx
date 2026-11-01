import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCountdown } from '../use-countdown'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useCountdown', () => {
  it('counts down to zero by itself and stays there', () => {
    const { result } = renderHook(() => useCountdown())
    expect(result.current.remaining).toBe(0)
    act(() => result.current.start(3))
    expect(result.current.remaining).toBe(3)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.remaining).toBe(2)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.remaining).toBe(0)
  })

  it('starts over when started again', () => {
    const { result } = renderHook(() => useCountdown())
    act(() => result.current.start(2))
    act(() => vi.advanceTimersByTime(2000))
    act(() => result.current.start(60))
    expect(result.current.remaining).toBe(60)
  })
})
