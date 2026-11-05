import { useCallback, useRef, useState } from 'react'

function measured(width: number): number | null {
  return width > 0 ? width : null
}

/**
 * The width of an element, kept current as it resizes. Returns a ref to hand
 * to the element and the width (null until measured, or where the browser
 * cannot observe sizes; a hidden or not yet laid out element reads as
 * unknown, not as zero). A callback ref owns the observer, so there is no
 * effect to keep in step with the element.
 */
export function useElementWidth(): [(element: HTMLElement | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!element || typeof ResizeObserver === 'undefined') return
    setWidth(measured(element.getBoundingClientRect().width))
    observer.current = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(measured(entry.contentRect.width))
    })
    observer.current.observe(element)
  }, [])

  return [ref, width]
}
