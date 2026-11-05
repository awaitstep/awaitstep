// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasLayoutStore } from '../canvas-layout-store'

beforeEach(() => {
  localStorage.clear()
  useCanvasLayoutStore.setState({ paletteOpen: false, inspectorOpen: true })
})

describe('canvas layout store', () => {
  it('toggles the palette without touching the inspector', () => {
    useCanvasLayoutStore.getState().togglePalette()
    expect(useCanvasLayoutStore.getState().paletteOpen).toBe(true)
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(true)
    useCanvasLayoutStore.getState().closePalette()
    expect(useCanvasLayoutStore.getState().paletteOpen).toBe(false)
  })

  it('sets the inspector explicitly, so asking to see it never hides it', () => {
    useCanvasLayoutStore.getState().setInspectorOpen(false)
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(false)
    useCanvasLayoutStore.getState().setInspectorOpen(true)
    useCanvasLayoutStore.getState().setInspectorOpen(true)
    expect(useCanvasLayoutStore.getState().inspectorOpen).toBe(true)
  })

  it('remembers nothing across reloads: a hidden inspector must not outlive the session', () => {
    useCanvasLayoutStore.getState().setInspectorOpen(false)
    useCanvasLayoutStore.getState().togglePalette()
    expect(localStorage.getItem('awaitstep-canvas')).toBeNull()
  })

  it('has no settings request left to leak: that travels in the URL now', () => {
    expect(Object.keys(useCanvasLayoutStore.getState())).not.toContain('settingsRequestedAt')
  })
})
