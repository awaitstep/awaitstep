import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api-client'
import type * as ApiClient from '../../../lib/api-client'
import { useIdeStore } from '../../../stores/ide-store'
import { CompareView } from '../compare-view'
import { makeReviewBindings, sourceFile } from './fixtures/review-bindings'

const api = vi.hoisted(() => ({ getProjectFile: vi.fn() }))
vi.mock('../../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  api,
}))
const pane = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }))
vi.mock('../diff-pane', () => ({
  DiffPane: (props: Record<string, unknown>) => {
    pane.props.push(props)
    return <div data-testid="diff" />
  },
}))

const server = {
  path: 'lib/charge.ts',
  hash: 'h2',
  size: 10,
  updatedAt: 'now',
  source: 'on server',
}
const baseline = new Map([['lib/charge.ts', sourceFile('lib/charge.ts', 'on server', 'h2')]])
const files = new Map([['lib/charge.ts', sourceFile('lib/charge.ts', 'mine')]])

function setup(overrides = {}, client = new QueryClient()) {
  const bindings = makeReviewBindings({ baseline, files, ...overrides })
  const tree = (b: typeof bindings) => (
    <QueryClientProvider client={client}>
      <CompareView path="lib/charge.ts" bindings={b} />
    </QueryClientProvider>
  )
  const view = render(tree(bindings))
  const update = (next: Partial<typeof bindings>) => view.rerender(tree({ ...bindings, ...next }))
  return Object.assign(bindings, { update, unmount: view.unmount })
}

beforeEach(() => {
  useIdeStore.getState().resetSession()
  useIdeStore.getState().setDraft('lib/charge.ts', 'mine', 'h1')
  useIdeStore.getState().openCompare('lib/charge.ts')
  api.getProjectFile.mockReset()
  api.getProjectFile.mockResolvedValue(server)
  pane.props = []
})

describe('CompareView', () => {
  it('reads the server copy itself and shows it on the left, read-only, beside the unsaved copy', async () => {
    setup()
    await screen.findByTestId('diff')
    expect(api.getProjectFile).toHaveBeenCalledWith('wf', 'lib/charge.ts')
    expect(pane.props.at(-1)).toMatchObject({
      original: 'on server',
      originalKind: 'server',
      modified: 'mine',
    })
    expect(screen.getByText(/^On the server · loaded .* · read-only$/)).toBeInTheDocument()
    expect(screen.getByText('Your copy · editable')).toBeInTheDocument()
  })

  it('Keep mine and overwrite is conditional on the hash of the copy that was shown', async () => {
    const bindings = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep mine and overwrite' }))
    expect(bindings.onOverwrite).toHaveBeenCalledWith('lib/charge.ts', 'h2')
  })

  it('does not let a second click through while the overwrite is running', async () => {
    let finish: (saved: boolean) => void = () => {}
    const onOverwrite = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    setup({ onOverwrite })
    const button = await screen.findByRole('button', { name: 'Keep mine and overwrite' })
    await userEvent.click(button)
    expect(button).toBeDisabled()
    await act(async () => finish(false))
    expect(button).toBeEnabled()
  })

  it('Use server version drops the unsaved copy and closes the Compare tab', async () => {
    const bindings = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Use server version' }))
    expect(bindings.onUseServerVersion).toHaveBeenCalledWith('lib/charge.ts', 'h2')
    expect(useIdeStore.getState().openPaths).not.toContain('ide:compare:lib/charge.ts')
  })

  it('says the server copy changed again when the editor learns of a newer hash, and Reload clears it', async () => {
    const bindings = setup()
    await screen.findByTestId('diff')
    expect(screen.queryByText(/changed again after this was loaded/)).toBeNull()
    const newer = new Map([['lib/charge.ts', sourceFile('lib/charge.ts', 'newer', 'h3')]])
    bindings.update({ baseline: newer })
    expect(await screen.findByText(/changed again after this was loaded/)).toBeInTheDocument()
    api.getProjectFile.mockResolvedValue({ ...server, hash: 'h3', source: 'newer' })
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await vi.waitFor(() => expect(api.getProjectFile).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(screen.queryByText(/changed again after this was loaded/)).toBeNull(),
    )
  })

  it('says so when a save was refused after this tab opened', async () => {
    setup()
    await screen.findByTestId('diff')
    act(() => useIdeStore.getState().setConflict('lib/charge.ts', { currentHash: 'h9' }))
    expect(screen.getByText(/changed again after this was loaded/)).toBeInTheDocument()
  })

  it('does not call the copy outdated for a refusal it was opened to settle, even after another write', async () => {
    // The save was refused at h2, then another write made it h3 before Compare read it.
    useIdeStore.getState().setConflict('lib/charge.ts', { currentHash: 'h2' })
    api.getProjectFile.mockResolvedValue({ ...server, hash: 'h3', source: 'newest' })
    setup()
    await screen.findByTestId('diff')
    expect(screen.queryByText(/changed again after this was loaded/)).toBeNull()
  })

  it('after its own overwrite reads the file back, so a second overwrite uses the new hash', async () => {
    api.getProjectFile
      .mockResolvedValueOnce(server)
      .mockResolvedValue({ ...server, hash: 'h4', source: 'mine' })
    const bindings = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep mine and overwrite' }))
    await vi.waitFor(() => expect(api.getProjectFile).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(pane.props.at(-1)).toMatchObject({ original: 'mine' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine and overwrite' }))
    expect(bindings.onOverwrite).toHaveBeenLastCalledWith('lib/charge.ts', 'h4')
    expect(screen.queryByText(/changed again after this was loaded/)).toBeNull()
  })

  it('keeps the copy it loaded when the tab is left and come back to', async () => {
    const client = new QueryClient()
    const first = setup({}, client)
    await screen.findByTestId('diff')
    first.unmount()
    api.getProjectFile.mockResolvedValue({ ...server, hash: 'h5', source: 'someone else' })
    setup({}, client)
    expect(await screen.findByTestId('diff')).toBeInTheDocument()
    expect(api.getProjectFile).toHaveBeenCalledTimes(1)
    expect(pane.props.at(-1)).toMatchObject({ original: 'on server' })
  })

  it('a file deleted on the server offers recreate or discard instead of a diff', async () => {
    api.getProjectFile.mockRejectedValue(new ApiError('File not found', 404))
    const bindings = setup()
    expect(await screen.findByText(/was deleted on the server/)).toBeInTheDocument()
    expect(screen.queryByTestId('diff')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save to recreate' }))
    expect(bindings.onRecreate).toHaveBeenCalledWith('lib/charge.ts')
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(bindings.onDiscardDeleted).toHaveBeenCalledWith('lib/charge.ts')
    // Nothing is left to compare, so the tab goes too.
    expect(useIdeStore.getState().openPaths).not.toContain('ide:compare:lib/charge.ts')
  })

  it('a deleted file whose copy is gone no longer says the copy is kept', async () => {
    useIdeStore.getState().clearDraft('lib/charge.ts')
    api.getProjectFile.mockRejectedValue(new ApiError('File not found', 404))
    setup()
    expect(await screen.findByText(/was deleted on the server\./)).toBeInTheDocument()
    expect(screen.queryByText(/copy is kept/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save to recreate' })).toBeNull()
  })

  it('a failed read offers Try again rather than a half-empty diff', async () => {
    api.getProjectFile.mockRejectedValueOnce(new ApiError('Server error', 500))
    setup()
    expect(await screen.findByText(/Couldn’t load the server copy/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('diff')).toBeInTheDocument()
  })

  it('cannot overwrite without edit rights', async () => {
    setup({ canEdit: false })
    expect(await screen.findByRole('button', { name: 'Keep mine and overwrite' })).toBeDisabled()
  })

  it('Close closes only the Compare tab', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(useIdeStore.getState().openPaths).toEqual([])
  })
})

describe('CompareView for a step source', () => {
  const step = 'steps/k3j9x_a1b2c3.ts'
  const stepBaseline = new Map([
    [step, { ...sourceFile(step, 'return 1', 'hs2'), role: 'source' as const }],
  ])
  const stepFiles = new Map([[step, { ...sourceFile(step, 'return 2'), role: 'source' as const }]])

  function setupStep(overrides = {}) {
    const bindings = makeReviewBindings({
      baseline: stepBaseline,
      files: stepFiles,
      ownerOf: (path) => (path.startsWith('steps/') ? 'step' : 'project'),
      ...overrides,
    })
    const tree = (b: typeof bindings) => (
      <QueryClientProvider client={new QueryClient()}>
        <CompareView path={step} bindings={b} />
      </QueryClientProvider>
    )
    const view = render(tree(bindings))
    return Object.assign(bindings, {
      update: (next: Partial<typeof bindings>) => view.rerender(tree({ ...bindings, ...next })),
    })
  }

  beforeEach(() => {
    useIdeStore.getState().resetSession()
    useIdeStore.getState().setDraft(step, 'return 2', 'hs1')
    useIdeStore.getState().openCompare(step)
  })

  it('shows the node’s code from the workspace on the left and fetches nothing', async () => {
    setupStep()
    await screen.findByTestId('diff')
    expect(api.getProjectFile).not.toHaveBeenCalled()
    expect(pane.props.at(-1)).toMatchObject({ original: 'return 1', modified: 'return 2' })
    expect(screen.getByText('On the canvas · read-only')).toBeInTheDocument()
    expect(screen.queryByText(/changed again after this was loaded/)).toBeNull()
  })

  it('Keep mine and overwrite saves over exactly the code shown, and Use canvas version drops the copy', async () => {
    const bindings = setupStep()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep mine and overwrite' }))
    expect(bindings.onOverwrite).toHaveBeenCalledWith(step, 'hs2')
    expect(api.getProjectFile).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Use canvas version' }))
    expect(bindings.onUseServerVersion).toHaveBeenCalledWith(step, 'hs2')
  })

  it('follows the workspace when the node’s code moves again', async () => {
    const bindings = setupStep()
    await screen.findByTestId('diff')
    bindings.update({
      baseline: new Map([
        [step, { ...sourceFile(step, 'return 3', 'hs3'), role: 'source' as const }],
      ]),
    })
    await vi.waitFor(() => expect(pane.props.at(-1)).toMatchObject({ original: 'return 3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep mine and overwrite' }))
    expect(bindings.onOverwrite).toHaveBeenLastCalledWith(step, 'hs3')
  })

  it('a step whose node was removed offers Discard and Close, never recreate', async () => {
    const bindings = setupStep({ baseline: new Map() })
    expect(await screen.findByText(/was removed from the canvas/)).toBeInTheDocument()
    expect(screen.queryByTestId('diff')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save to recreate' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(bindings.onDiscardDeleted).toHaveBeenCalledWith(step)
    expect(useIdeStore.getState().openPaths).not.toContain(`ide:compare:${step}`)
  })
})
