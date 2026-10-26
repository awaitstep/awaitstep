import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so testing-library cannot register its own cleanup.
afterEach(cleanup)

// jsdom lacks layout and pointer-capture APIs. Radix Popover measures its
// trigger with ResizeObserver, cmdk and Radix Select scroll the highlighted
// row into view, and Radix Select captures the pointer when it opens.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver
Element.prototype.scrollIntoView ??= function scrollIntoView() {}
Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
  return false
}
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {}
