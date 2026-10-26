import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so testing-library cannot register its own cleanup.
afterEach(cleanup)

// jsdom lacks layout APIs. Radix Popover measures its trigger with
// ResizeObserver, and cmdk scrolls the highlighted row into view.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver
Element.prototype.scrollIntoView ??= function scrollIntoView() {}
