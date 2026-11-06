import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
// Not beside the component: the kit import boundary walks every file under
// components/ui, and this one reaches the theme store through CodeEditor,
// which is legacy-allowed there while its test file would not be.
import { CodeEditor } from '../ui/code-editor'

// Monaco stands in as a textarea that reports its mount like the real editor does.
const blurListeners: Array<() => void> = []
vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
    onMount,
    options,
    height,
  }: {
    value: string
    onChange: (v: string) => void
    onMount?: (editor: { onDidBlurEditorText: (l: () => void) => void }) => void
    options: { readOnly?: boolean }
    height: string
  }) => {
    useEffect(() => {
      onMount?.({ onDidBlurEditorText: (l) => blurListeners.push(l) })
    }, [onMount])
    return (
      <textarea
        aria-label="code"
        data-readonly={String(options.readOnly ?? false)}
        data-height={height}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  },
}))
vi.mock('../../lib/monaco/setup', () => ({ configureMonaco: vi.fn() }))
vi.mock('../../lib/monaco/theme', () => ({ useMonacoTheme: () => 'vs-dark' }))

function blurEditor() {
  for (const listener of blurListeners) listener()
}

describe('CodeEditor with debounceMs', () => {
  beforeEach(() => {
    blurListeners.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes a pending edit when the editor loses focus', async () => {
    const onChange = vi.fn()
    render(<CodeEditor value="a" onChange={onChange} debounceMs={300} />)
    const area = await screen.findByLabelText('code')
    vi.useFakeTimers()
    fireEvent.change(area, { target: { value: 'ab' } })
    expect(onChange).not.toHaveBeenCalled()
    blurEditor()
    expect(onChange).toHaveBeenCalledWith('ab')
    vi.advanceTimersByTime(300)
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('writes a pending edit through the latest onChange when it unmounts', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender, unmount } = render(<CodeEditor value="a" onChange={first} debounceMs={300} />)
    const area = await screen.findByLabelText('code')
    vi.useFakeTimers()
    fireEvent.change(area, { target: { value: 'abc' } })
    rerender(<CodeEditor value="a" onChange={second} debounceMs={300} />)
    unmount()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('abc')
  })
})
