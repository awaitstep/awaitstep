import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdeStore } from '../../../stores/ide-store'
import { DiffPane } from '../diff-pane'

const fake = vi.hoisted(() => {
  const state = {
    props: [] as Record<string, unknown>[],
    contentListeners: [] as (() => void)[],
    diffListeners: [] as (() => void)[],
    disposeListeners: [] as (() => void)[],
    value: 'typed',
    focused: 0,
    revealed: 0,
    changes: [{}, {}] as unknown[] | null,
    went: [] as string[],
    markers: [{ message: 'Cannot find module' }] as unknown[],
    markerListeners: [] as ((uris: { toString(): string }[]) => void)[],
    cleared: [] as string[],
  }
  return state
})

vi.mock('@monaco-editor/react', async () => {
  const react = await import('react')
  function MockDiff(props: Record<string, unknown>) {
    fake.props.push(props)
    const mounted = react.useRef(false)
    react.useEffect(() => {
      if (mounted.current) return
      mounted.current = true
      const modified = {
        onDidChangeModelContent: (cb: () => void) => fake.contentListeners.push(cb),
        onDidDispose: (cb: () => void) => fake.disposeListeners.push(cb),
        getValue: () => fake.value,
        focus: () => (fake.focused += 1),
        getAction: () => undefined,
        hasTextFocus: () => true,
        getModel: () => null,
        getSelection: () => null,
      }
      const uri = { toString: () => 'awaitstep-saved://workflow/wf%201/lib/charge.ts' }
      const model = { uri }
      const original = {
        getModel: () => model,
        onDidDispose: () => undefined,
      }
      const monaco = {
        editor: {
          getModelMarkers: () => fake.markers,
          setModelMarkers: (_m: unknown, owner: string) => {
            fake.cleared.push(owner)
            fake.markers = []
          },
          onDidChangeMarkers: (cb: (uris: { toString(): string }[]) => void) => {
            fake.markerListeners.push(cb)
            return { dispose: () => undefined }
          },
        },
      }
      const diff = {
        getOriginalEditor: () => original,
        getModifiedEditor: () => modified,
        onDidUpdateDiff: (cb: () => void) => fake.diffListeners.push(cb),
        getLineChanges: () => fake.changes,
        revealFirstDiff: () => (fake.revealed += 1),
        goToDiff: (direction: string) => fake.went.push(direction),
      }
      ;(props.onMount as (d: unknown, m: unknown) => void)(diff, monaco)
    }, [])
    return <div data-testid="monaco-diff" />
  }
  return { DiffEditor: MockDiff, default: () => null, useMonaco: () => null }
})
vi.mock('../../../lib/monaco/theme', () => ({ useMonacoTheme: () => 'vs' }))

function renderPane(overrides: Partial<React.ComponentProps<typeof DiffPane>> = {}) {
  const props: React.ComponentProps<typeof DiffPane> = {
    workflowId: 'wf 1',
    path: 'lib/charge.ts',
    original: 'saved',
    originalKind: 'saved',
    modified: 'mine',
    readOnly: false,
    sideBySide: true,
    onChange: vi.fn(),
    onApi: vi.fn(),
    onChangeCount: vi.fn(),
    ...overrides,
  }
  const view = render(<DiffPane {...props} />)
  return { props, view }
}

const lastProps = () => fake.props.at(-1)!

beforeEach(() => {
  useIdeStore.getState().resetSession()
  Object.assign(fake, {
    props: [],
    contentListeners: [],
    diffListeners: [],
    disposeListeners: [],
    value: 'typed',
    focused: 0,
    revealed: 0,
    changes: [{}, {}],
    went: [],
    markers: [{ message: 'Cannot find module' }],
    markerListeners: [],
    cleared: [],
  })
  document.body.focus()
})

describe('DiffPane', () => {
  it('clears the language service’s squiggles on the read-only left copy, now and when they come back', async () => {
    renderPane()
    await screen.findByTestId('monaco-diff')
    expect(fake.cleared).toContain('typescript')
    fake.markers = [{ message: 'Cannot find module' }]
    fake.cleared = []
    fake.markerListeners.forEach((cb) =>
      cb([{ toString: () => 'awaitstep-saved://workflow/wf%201/lib/charge.ts' }]),
    )
    expect(fake.cleared).toContain('typescript')
    // Markers of some other model are left alone.
    fake.markers = [{ message: 'x' }]
    fake.cleared = []
    fake.markerListeners.forEach((cb) =>
      cb([{ toString: () => 'awaitstep://workflow/wf%201/a.ts' }]),
    )
    expect(fake.cleared).toEqual([])
  })

  it('uses the workspace’s model for the right side, and keeps it when the pane goes', async () => {
    renderPane()
    await screen.findByTestId('monaco-diff')
    expect(lastProps()).toMatchObject({
      modifiedModelPath: 'awaitstep://workflow/wf%201/lib/charge.ts',
      keepCurrentModifiedModel: true,
      original: 'saved',
    })
    // The left model is the pane’s own, apart from the workspace’s and from the other kind of left side.
    expect(lastProps().originalModelPath).toBe('awaitstep-saved://workflow/wf%201/lib/charge.ts')
  })

  it('keeps the Compare copy on a model of its own, apart from the saved text', async () => {
    renderPane({ originalKind: 'server' })
    await screen.findByTestId('monaco-diff')
    expect(lastProps().originalModelPath).toBe('awaitstep-server://workflow/wf%201/lib/charge.ts')
  })

  it('never feeds typing back into the editor: the right side’s text is fixed at open', async () => {
    const { view, props } = renderPane()
    await screen.findByTestId('monaco-diff')
    view.rerender(<DiffPane {...props} modified="mine plus what was typed since" />)
    expect(lastProps().modified).toBe('mine')
  })

  it('reports typing on the right side as the full text', async () => {
    const { props } = renderPane()
    await screen.findByTestId('monaco-diff')
    fake.contentListeners.forEach((cb) => cb())
    expect(props.onChange).toHaveBeenCalledWith('typed')
  })

  it('always reports typing to the latest handler, not the one from when it mounted', async () => {
    const { props, view } = renderPane()
    await screen.findByTestId('monaco-diff')
    const later = vi.fn()
    view.rerender(<DiffPane {...props} onChange={later} />)
    fake.contentListeners.forEach((cb) => cb())
    expect(later).toHaveBeenCalledWith('typed')
    expect(props.onChange).not.toHaveBeenCalled()
  })

  it('counts changes when the diff updates and scrolls to the first one once', async () => {
    const { props } = renderPane()
    await screen.findByTestId('monaco-diff')
    fake.diffListeners.forEach((cb) => cb())
    fake.diffListeners.forEach((cb) => cb())
    expect(props.onChangeCount).toHaveBeenCalledWith(2)
    expect(fake.revealed).toBe(1)
  })

  it('hands the header a way to step through changes', async () => {
    const { props } = renderPane()
    await screen.findByTestId('monaco-diff')
    const api = (props.onApi as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    api.goToDiff('next')
    api.goToDiff('previous')
    expect(fake.went).toEqual(['next', 'previous'])
  })

  it('shows the left side as read-only and honours a read-only file', async () => {
    renderPane({ readOnly: true, sideBySide: false })
    await screen.findByTestId('monaco-diff')
    expect(lastProps().options).toMatchObject({
      originalEditable: false,
      readOnly: true,
      renderSideBySide: false,
      useInlineViewWhenSpaceIsLimited: false,
      ignoreTrimWhitespace: false,
    })
  })

  it('takes the keyboard when nothing has it, and leaves it with a toolbar button that does', async () => {
    renderPane()
    await screen.findByTestId('monaco-diff')
    expect(fake.focused).toBe(1)

    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    fake.focused = 0
    renderPane()
    await vi.waitFor(() => expect(fake.props.length).toBeGreaterThan(1))
    expect(fake.focused).toBe(0)
    button.remove()
  })

  it('does not take the keyboard when it replaces another file’s pane (autoFocus off)', async () => {
    renderPane({ autoFocus: false })
    await screen.findByTestId('monaco-diff')
    expect(fake.focused).toBe(0)
  })

  it('is the editor for the shortcuts and Esc handoffs while it is open, and lets go when it is not', async () => {
    renderPane()
    await screen.findByTestId('monaco-diff')
    const handle = useIdeStore.getState().editorHandle
    expect(handle).not.toBeNull()
    handle!.focus()
    expect(fake.focused).toBe(2)
    fake.disposeListeners.forEach((cb) => cb())
    expect(useIdeStore.getState().editorHandle).toBeNull()
  })

  it('does not clear an editor handle that another editor has taken since', async () => {
    renderPane()
    await screen.findByTestId('monaco-diff')
    const other = { focus: vi.fn(), trigger: vi.fn(), searchSeed: () => null }
    useIdeStore.getState().setEditorHandle(other)
    fake.disposeListeners.forEach((cb) => cb())
    expect(useIdeStore.getState().editorHandle).toBe(other)
  })
})
