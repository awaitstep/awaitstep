import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useIdeStore } from '../../../stores/ide-store'
import { LibraryWorkspaceView } from '../library-workspace'
import { ProjectFileConflictError } from '../../../lib/api-client'
import { SOURCES, salesTree, withFile } from './fixtures/library-tree'

const api = vi.hoisted(() => ({
  getTree: vi.fn(),
  getFile: vi.fn(),
  putFile: vi.fn(),
  check: vi.fn(),
  publish: vi.fn(),
  getUsages: vi.fn(),
  listVersions: vi.fn(),
  restore: vi.fn(),
  deleteItem: vi.fn(),
  getVersion: vi.fn(),
}))
vi.mock('../../../lib/library-api', () => ({ libraryApi: api }))

// A stand-in editor: a textarea per model path that reports typing as Monaco would.
vi.mock('@monaco-editor/react', () => ({
  default: (props: {
    path: string
    defaultValue: string
    options: { readOnly?: boolean }
    onMount: (instance: unknown) => void
    onChange: (value: string) => void
  }) => {
    const instance = {
      getModel: () => ({ uri: { toString: () => props.path } }),
      onDidChangeCursorPosition: () => undefined,
      onDidDispose: () => undefined,
      focus: () => undefined,
      getAction: () => null,
    }
    queueMicrotask(() => props.onMount(instance))
    return (
      <textarea
        aria-label={`Editor ${props.path}`}
        data-readonly={props.options.readOnly ? 'true' : 'false'}
        defaultValue={props.defaultValue}
        onChange={(event) => props.onChange(event.target.value)}
      />
    )
  },
  useMonaco: () => null,
}))
vi.mock('../../../lib/monaco/theme', () => ({ useMonacoTheme: () => 'vs' }))
vi.mock('../../../hooks/use-min-width', () => ({ useMinWidth: () => true }))
vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ status: 'idle' }),
}))

const place = { org: 'acme', project: 'project-101', workspace: 'sales' }

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderIde(
  open: { item?: string; file?: string } = { item: 'lead' },
  client: QueryClient = newClient(),
) {
  return render(
    <QueryClientProvider client={client}>
      <LibraryWorkspaceView
        place={place}
        placeName="Sales"
        initialItem={open.item}
        initialFile={open.file}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useIdeStore.getState().resetSession()
  api.getTree.mockResolvedValue(salesTree())
  api.getFile.mockImplementation((id: string, path: string) =>
    Promise.resolve({ path, source: SOURCES[`${id}/${path}`] ?? '', hash: `h-${path}` }),
  )
  api.check.mockResolvedValue({ version: '1.0.1', bumpedFrom: null, problems: [] })
  api.getUsages.mockResolvedValue({
    uses: [],
    usedBy: {
      visible: [{ kind: 'workflow', id: 'w1', name: 'Lead routing', workspace: {}, runs: '1.0.0' }],
      hiddenCount: 1,
    },
  })
  api.listVersions.mockResolvedValue({ versions: [] })
})

afterEach(() => vi.clearAllMocks())

describe('Library IDE', () => {
  it('lists the place’s items under /modules and /nodes, opening the item the URL names', async () => {
    renderIde()
    const files = await screen.findByRole('navigation', { name: 'Files' })
    expect(await within(files).findByRole('button', { name: 'lead-scoring' })).toBeVisible()
    expect(within(files).getByText('/modules')).toBeVisible()
    expect(within(files).getByText('/nodes')).toBeVisible()
    expect(within(files).getByRole('button', { name: 'post' })).toBeVisible()
    const editor = await screen.findByLabelText(
      'Editor awaitstep://workflow/library-workspace-ws-sales/modules/lead-scoring/index.ts',
    )
    expect(editor).toHaveValue(SOURCES['lead/index.ts'])
  })

  it('counts unsaved files on Save and writes each against the hash it was read at', async () => {
    api.putFile.mockResolvedValue({ path: 'index.ts', hash: 'h-new', size: 1, updatedAt: '' })
    renderIde()
    const editor = await screen.findByLabelText(/modules\/lead-scoring\/index.ts$/)
    await userEvent.type(editor, '// edit')
    const save = screen.getByRole('button', { name: /^Save/ })
    expect(save).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Publish v1.0.1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Publish v1.0.1' })).toHaveAttribute(
      'title',
      'Save first',
    )
    await userEvent.click(save)
    await waitFor(() => expect(api.putFile).toHaveBeenCalled())
    const [itemId, path, source, precondition] = api.putFile.mock.calls[0]!
    expect([itemId, path, precondition]).toEqual(['lead', 'index.ts', { ifMatch: 'h-index.ts' }])
    expect(source).toContain('// edit')
  })

  it('publishes the version the check names after naming who uses the item', async () => {
    api.publish.mockResolvedValue({
      version: '1.0.1',
      seq: 2,
      publishedAt: '',
      bumpedFrom: null,
      pruned: [],
    })
    renderIde()
    const button = await screen.findByRole('button', { name: 'Publish v1.0.1' })
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)
    const dialog = await screen.findByRole('alertdialog', { name: 'Publish Lead scoring v1.0.1?' })
    expect(
      await within(dialog).findByText(/Used by Lead routing, 1 more you can’t open/),
    ).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish v1.0.1' }))
    expect(api.publish).toHaveBeenCalledWith('lead')
  })

  it('keeps a published node folder read-only: it says so and sends no write', async () => {
    renderIde({ file: 'nodes/post/1.0.0/template.ts' })
    const editor = await screen.findByLabelText(/nodes\/post\/1.0.0\/template.ts$/)
    expect(editor).toHaveAttribute('data-readonly', 'true')
    expect(screen.getByText(/This version is published and can’t change/)).toBeVisible()
    await userEvent.type(editor, 'x')
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeDisabled()
    expect(api.putFile).not.toHaveBeenCalled()
  })

  it('lists the check’s findings in Problems and holds Publish back', async () => {
    api.check.mockResolvedValue({
      version: '1.0.1',
      bumpedFrom: null,
      problems: [{ path: 'package.json.version', message: 'Invalid version' }],
    })
    renderIde()
    const problems = await screen.findByRole('region', { name: 'Problems' })
    expect(await within(problems).findByText(/version: Invalid version/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Publish v1.0.1' })).toHaveAttribute(
      'title',
      '1 problem to fix',
    )
  })

  it('shows a viewer the code with no Save and no Publish', async () => {
    api.getTree.mockResolvedValue(
      salesTree({
        viewerCan: {
          edit: { allowed: false, reason: 'Changing library items needs an Editor' },
          create: { allowed: false },
        },
      }),
    )
    renderIde()
    const editor = await screen.findByLabelText(/modules\/lead-scoring\/index.ts$/)
    expect(editor).toHaveAttribute('data-readonly', 'true')
    expect(screen.getByText('Changing library items needs an Editor')).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Publish/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })

  it('keeps the editor mounted across a save, never refetching what it wrote, and clears the count', async () => {
    api.putFile.mockResolvedValue({ path: 'index.ts', hash: 'h-saved', size: 1, updatedAt: '' })
    api.getTree
      .mockResolvedValueOnce(salesTree())
      .mockResolvedValue(withFile(salesTree(), 'lead', 'index.ts', 'h-saved'))
    renderIde()
    const editor = await screen.findByLabelText(/modules\/lead-scoring\/index.ts$/)
    await userEvent.type(editor, '// edit')
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled())
    expect(screen.getByLabelText(/modules\/lead-scoring\/index.ts$/)).toBe(editor)
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(useIdeStore.getState().drafts).toEqual({})
    const fetchedIndex = api.getFile.mock.calls.filter(
      ([id, path]) => id === 'lead' && path === 'index.ts',
    )
    expect(fetchedIndex).toHaveLength(1)
  })

  it('drops the item’s edits on restore, so the restored code is not shown as unsaved', async () => {
    api.listVersions.mockResolvedValue({
      versions: [
        { version: '1.0.1', seq: 2, publishedAt: '2026-11-10T00:00:00.000Z', publishedBy: null },
        { version: '1.0.0', seq: 1, publishedAt: '2026-11-01T00:00:00.000Z', publishedBy: null },
      ],
    })
    api.restore.mockResolvedValue({ restoredFrom: '1.0.0', version: '1.0.2' })
    renderIde()
    const editor = await screen.findByLabelText(/modules\/lead-scoring\/index.ts$/)
    await userEvent.type(editor, '// unsaved')
    expect(Object.keys(useIdeStore.getState().drafts)).toEqual(['modules/lead-scoring/index.ts'])
    const details = screen.getByRole('region', { name: 'Versions' })
    await userEvent.click(await within(details).findByRole('button', { name: 'Restore' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Restore v1.0.0?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Restore' }))
    expect(api.restore).toHaveBeenCalledWith('lead', '1.0.0')
    await waitFor(() => expect(useIdeStore.getState().drafts).toEqual({}))
  })

  it('opens the new folder after New version, from the tree as refetched', async () => {
    api.restore.mockResolvedValue({ restoredFrom: '1.0.0', version: '1.0.1' })
    const after = salesTree()
    after.items[1]!.files.push(
      { path: '1.0.1/node.json', hash: 'h-new-json', readOnly: false },
      { path: '1.0.1/template.ts', hash: 'h-new-tpl', readOnly: false },
    )
    api.getTree.mockResolvedValueOnce(salesTree()).mockResolvedValue(after)
    renderIde()
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for post' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New version' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Start a new version of Post?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'New version' }))
    expect(api.restore).toHaveBeenCalledWith('post', '1.0.0')
    expect(await screen.findByLabelText(/nodes\/post\/1.0.1\/node.json$/)).toBeVisible()
  })

  it('opens the URL’s item on a second visit, when the tree is already cached', async () => {
    const client = newClient()
    const first = renderIde({ item: 'lead' }, client)
    await screen.findByLabelText(/modules\/lead-scoring\/index.ts$/)
    first.unmount()
    renderIde({ item: 'post' }, client)
    expect(await screen.findByLabelText(/nodes\/post\/1.0.0\/node.json$/)).toBeVisible()
    expect(useIdeStore.getState().openPaths).toEqual(['nodes/post/1.0.0/node.json'])
  })

  it('clears a deleted item’s tabs and edits', async () => {
    api.deleteItem.mockResolvedValue(undefined)
    renderIde()
    const editor = await screen.findByLabelText(/modules\/lead-scoring\/index.ts$/)
    await userEvent.type(editor, 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Actions for lead-scoring' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Lead scoring?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(useIdeStore.getState().drafts).toEqual({}))
    expect(useIdeStore.getState().openPaths).toEqual([])
  })

  it('adds a file at a module’s root from the item’s menu', async () => {
    api.putFile.mockResolvedValue({ path: 'helpers.ts', hash: 'h-helpers', size: 0, updatedAt: '' })
    renderIde()
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for lead-scoring' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New file' }))
    const dialog = await screen.findByRole('dialog', { name: 'New file' })
    await userEvent.type(within(dialog).getByRole('textbox'), 'helpers.ts')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(api.putFile).toHaveBeenCalledWith('lead', 'helpers.ts', '', { ifNoneMatch: true }),
    )
  })

  it('offers Open read-only in a module’s history only for nodes', async () => {
    api.listVersions.mockResolvedValue({
      versions: [
        { version: '1.0.0', seq: 1, publishedAt: '2026-11-01T00:00:00.000Z', publishedBy: null },
      ],
    })
    api.getVersion.mockResolvedValue({ version: '1.0.0', files: [], imports: [] })
    renderIde()
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for lead-scoring' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Version history' }))
    const dialog = await screen.findByRole('dialog', { name: /Lead scoring · version history/ })
    await within(dialog).findByRole('list', { name: 'Versions' })
    expect(within(dialog).queryByRole('button', { name: 'Open read-only' })).not.toBeInTheDocument()
  })

  it('compares a refused save with the server’s copy and keeps mine against that copy', async () => {
    api.putFile
      .mockRejectedValueOnce(
        new ProjectFileConflictError('File changed since it was read', 'h-theirs'),
      )
      .mockResolvedValue({ path: 'index.ts', hash: 'h-mine', size: 1, updatedAt: '' })
    renderIde()
    const editor = await screen.findByLabelText(/modules\/lead-scoring\/index.ts$/)
    await userEvent.type(editor, '// mine')
    api.getFile.mockImplementation((id: string, path: string) =>
      Promise.resolve({
        path,
        source:
          id === 'lead' && path === 'index.ts' ? 'theirs\n' : (SOURCES[`${id}/${path}`] ?? ''),
        hash: 'h-theirs',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }))
    expect(await screen.findByText('It changed on the server since you opened it.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }))
    const dialog = await screen.findByRole('dialog', { name: 'Compare index.ts' })
    expect(await within(dialog).findByText('theirs')).toBeVisible()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep mine' }))
    await waitFor(() => expect(api.putFile).toHaveBeenCalledTimes(2))
    expect(api.putFile.mock.calls[1]![3]).toEqual({ ifMatch: 'h-theirs' })
  })
})
