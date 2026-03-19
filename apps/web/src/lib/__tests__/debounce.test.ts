import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from '../debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls fn after the delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('passes arguments through', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('a', 'b')
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledWith('a', 'b')
  })

  it('resets the timer on subsequent calls', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('first')
    vi.advanceTimersByTime(200)
    debounced('second')
    vi.advanceTimersByTime(200)

    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('second')
  })

  it('cancel prevents the pending call', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(300)

    expect(fn).not.toHaveBeenCalled()
  })

  it('can be called again after cancel', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('cancelled')
    debounced.cancel()

    debounced('after')
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('after')
  })
})
