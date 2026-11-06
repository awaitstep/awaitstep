import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Input } from '../input'

describe('Input with debounceMs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports a change after the delay', () => {
    const onChange = vi.fn()
    render(<Input aria-label="name" value="" onChange={onChange} debounceMs={300} />)
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'a' } })
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('writes a pending edit when the input leaves the page, instead of dropping it', () => {
    const onChange = vi.fn()
    const { unmount } = render(
      <Input aria-label="name" value="" onChange={onChange} debounceMs={300} />,
    )
    fireEvent.change(screen.getByLabelText('name'), { target: { value: 'ab' } })
    unmount()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0]![0].target.value).toBe('ab')
  })

  it('writes a pending edit on blur and still calls the given onBlur', () => {
    const onChange = vi.fn()
    const onBlur = vi.fn()
    render(
      <Input aria-label="name" value="" onChange={onChange} onBlur={onBlur} debounceMs={300} />,
    )
    const input = screen.getByLabelText('name')
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledOnce()
    expect(onBlur).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(300)
    expect(onChange).toHaveBeenCalledOnce()
  })
})
