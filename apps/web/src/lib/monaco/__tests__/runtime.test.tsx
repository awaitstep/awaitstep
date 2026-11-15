import { Suspense } from 'react'
import { act, render, renderHook, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real runtime, not the stand-in the DOM setup gives every other test.
vi.unmock('../runtime')

const fake = { editor: {} }
let release: () => void = () => {}

beforeEach(() => {
  vi.resetModules()
  // The bundle arrives only when the test lets it, like a large chunk loading.
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.doMock('../bundled-monaco', async () => {
    await gate
    return { monaco: fake }
  })
  vi.doMock('@monaco-editor/react', () => ({
    default: () => <div data-testid="editor" />,
    DiffEditor: () => <div data-testid="diff" />,
  }))
})

describe('the Monaco runtime', () => {
  it('starts one load and hands every caller the same instance', async () => {
    const { loadMonaco } = await import('../runtime')
    const first = loadMonaco()
    expect(loadMonaco()).toBe(first)
    release()
    expect(await first).toBe(fake)
  })

  it('gives a hook nothing until the bundle has loaded, then the instance', async () => {
    const { useMonaco } = await import('../runtime')
    const { result } = renderHook(() => useMonaco())
    expect(result.current).toBeNull()
    await act(async () => release())
    expect(result.current).toBe(fake)
  })

  it('mounts an editor only once the bundle is in place, so its loader never reaches for a CDN', async () => {
    const { MonacoEditor } = await import('../runtime')
    render(
      <Suspense fallback={<div data-testid="waiting" />}>
        <MonacoEditor />
      </Suspense>,
    )
    await act(async () => {})
    expect(screen.getByTestId('waiting')).toBeInTheDocument()
    expect(screen.queryByTestId('editor')).toBeNull()
    await act(async () => release())
    expect(await screen.findByTestId('editor')).toBeInTheDocument()
  })

  it('tries again after a failed load instead of remembering the failure', async () => {
    vi.doMock('../bundled-monaco', () => {
      throw new Error('chunk failed')
    })
    const { loadMonaco } = await import('../runtime')
    await expect(loadMonaco()).rejects.toThrow()
    vi.doMock('../bundled-monaco', () => ({ monaco: fake }))
    expect(await loadMonaco()).toBe(fake)
  })
})
