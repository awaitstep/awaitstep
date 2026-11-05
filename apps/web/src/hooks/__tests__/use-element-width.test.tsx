import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElementWidth } from '../use-element-width'

let callbacks: ((entries: { contentRect: { width: number } }[]) => void)[] = []
const disconnect = vi.fn()

beforeEach(() => {
  callbacks = []
  disconnect.mockClear()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
        callbacks.push(cb)
      }
      observe() {}
      disconnect = disconnect
    },
  )
})

afterEach(() => vi.unstubAllGlobals())

function Probe() {
  const [ref, width] = useElementWidth()
  return (
    <div ref={ref}>
      <span data-testid="width">{width === null ? 'unknown' : width}</span>
    </div>
  )
}

describe('useElementWidth', () => {
  it('reads an element that has no size yet as unknown, not zero', () => {
    render(<Probe />)
    expect(screen.getByTestId('width')).toHaveTextContent('unknown')
  })

  it('follows the element as it resizes', () => {
    render(<Probe />)
    act(() => callbacks[0]!([{ contentRect: { width: 1400 } }]))
    expect(screen.getByTestId('width')).toHaveTextContent('1400')
    act(() => callbacks[0]!([{ contentRect: { width: 900 } }]))
    expect(screen.getByTestId('width')).toHaveTextContent('900')
  })

  it('stops observing when the element goes', () => {
    const view = render(<Probe />)
    view.unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})
