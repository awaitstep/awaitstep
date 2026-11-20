import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { installFetchDispatcher } from './fake-api/fetch-dispatcher'

// Before any app module loads: better-auth's client keeps the `fetch` it finds then.
installFetchDispatcher()

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

// The bundled Monaco is browser-only. Tests get the runtime as jsdom had it
// before the bundle: no instance from `useMonaco`, and editor components
// taken straight from `@monaco-editor/react`, which tests replace.
vi.mock('../lib/monaco/runtime', async () => {
  const { lazy } = await import('react')
  const editorModule = () => import('@monaco-editor/react')
  return {
    loadMonaco: () => new Promise(() => {}),
    useMonaco: () => null,
    MonacoEditor: lazy(editorModule),
    MonacoDiffEditor: lazy(() => editorModule().then((m) => ({ default: m.DiffEditor }))),
  }
})
