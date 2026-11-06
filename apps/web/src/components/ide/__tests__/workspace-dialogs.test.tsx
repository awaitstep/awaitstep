import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceFile } from '../../../lib/api-client'
import type { ProjectFilesController } from '../../../hooks/use-project-files'
import { useIdeExplorerStore } from '../../../stores/ide-explorer-store'
import { useIdeStore } from '../../../stores/ide-store'
import { WorkspaceDialogs, WorkspaceUnsavedDialog, type UnsavedBlocker } from '../workspace-dialogs'

vi.mock('../../../lib/action-toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actionToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const baseline = new Map<string, SourceFile>([
  ['a.ts', { path: 'a.ts', source: 'a', role: 'module', hash: 'ha' }],
  ['b.ts', { path: 'b.ts', source: 'b', role: 'module', hash: 'hb' }],
])

function projectFilesStub(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    busy: false,
    renameFile: vi.fn().mockResolvedValue(true),
    deleteFile: vi.fn().mockResolvedValue(true),
    saveFile: vi.fn().mockResolvedValue(true),
    saveFiles: vi.fn((paths: string[]) => Promise.resolve(paths.map(() => true))),
    convertHandlers: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as ProjectFilesController & Record<string, ReturnType<typeof vi.fn>>
}

function renderDialogs(projectFiles = projectFilesStub()) {
  const conversionPreview = {
    data: { source: 'file' as const, paths: ['handlers/a.ts'], declarations: {} },
    error: null,
    isPending: false,
  }
  render(
    <WorkspaceDialogs
      storedPaths={new Set(baseline.keys())}
      projectFiles={projectFiles}
      conversionPreview={conversionPreview}
    />,
  )
  return projectFiles
}

beforeEach(() => {
  useIdeStore.getState().resetSession()
  useIdeExplorerStore.getState().reset()
})

describe('WorkspaceDialogs', () => {
  it('renders nothing while no dialog is open', () => {
    renderDialogs()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('names the file in the delete question and deletes it on confirm', async () => {
    const projectFiles = renderDialogs()
    act(() => useIdeStore.getState().showDialog('deleteFile', 'a.ts'))
    expect(await screen.findByText('Delete a.ts?')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(projectFiles.deleteFile).toHaveBeenCalledWith('a.ts')
    expect(useIdeStore.getState().dialog).toBeNull()
  })

  it('converts to handler modules on confirm', async () => {
    const projectFiles = renderDialogs()
    act(() => useIdeStore.getState().showDialog('convertHandlers'))
    await userEvent.click(await screen.findByRole('button', { name: 'Convert' }))
    expect(projectFiles.convertHandlers).toHaveBeenCalledTimes(1)
    expect(useIdeStore.getState().dialog).toBeNull()
  })

  it('describes the conversion plan it was given', async () => {
    renderDialogs()
    act(() => useIdeStore.getState().showDialog('convertHandlers'))
    expect(await screen.findByText(/handlers\.ts is replaced by handlers\/a\.ts/)).toBeTruthy()
  })

  it('closes the tabs after saving every unsaved one, as one batch', async () => {
    const projectFiles = renderDialogs()
    const store = useIdeStore.getState()
    store.openFile('a.ts')
    store.openFile('b.ts')
    store.setDraft('a.ts', 'x', 'ha')
    store.setDraft('b.ts', 'y', 'hb')
    act(() => useIdeStore.getState().requestClose(['a.ts', 'b.ts']))
    await userEvent.click(await screen.findByRole('button', { name: 'Save all' }))
    expect(projectFiles.saveFiles).toHaveBeenCalledTimes(1)
    expect(projectFiles.saveFiles).toHaveBeenCalledWith(['a.ts', 'b.ts'])
    await waitFor(() => expect(useIdeStore.getState().openPaths).toEqual([]))
  })

  it('keeps a tab open, with its edit, when its save failed', async () => {
    const projectFiles = renderDialogs(
      projectFilesStub({ saveFiles: vi.fn().mockResolvedValue([false]) }),
    )
    const store = useIdeStore.getState()
    store.openFile('a.ts')
    store.setDraft('a.ts', 'x', 'ha')
    act(() => useIdeStore.getState().requestClose(['a.ts']))
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() => expect(projectFiles.saveFiles).toHaveBeenCalled())
    await waitFor(() => expect(useIdeStore.getState().closeRequest).toBeNull())
    expect(useIdeStore.getState().openPaths).toContain('a.ts')
    expect(useIdeStore.getState().drafts['a.ts']).toBeDefined()
  })

  it('drops the drafts and closes the tabs on Don’t save', async () => {
    renderDialogs()
    const store = useIdeStore.getState()
    store.openFile('a.ts')
    store.setDraft('a.ts', 'x', 'ha')
    act(() => useIdeStore.getState().requestClose(['a.ts']))
    await userEvent.click(await screen.findByRole('button', { name: 'Don’t save' }))
    expect(useIdeStore.getState().drafts['a.ts']).toBeUndefined()
    expect(useIdeStore.getState().openPaths).not.toContain('a.ts')
  })
})

describe('WorkspaceUnsavedDialog', () => {
  function blocked(): UnsavedBlocker & { proceed: () => void; reset: () => void } {
    return {
      status: 'blocked',
      current: { pathname: '/wf', search: { view: 'ide' } },
      next: { pathname: '/wf', search: { view: 'canvas' } },
      proceed: vi.fn(),
      reset: vi.fn(),
    }
  }

  function renderUnsaved(
    blocker: UnsavedBlocker,
    props: Partial<Parameters<typeof WorkspaceUnsavedDialog>[0]> = {},
  ) {
    const saveAll = vi.fn().mockResolvedValue(2)
    render(
      <WorkspaceUnsavedDialog
        blocker={blocker}
        dirtyCount={2}
        canEdit
        wideEnough
        saving={false}
        saveAll={saveAll}
        {...props}
      />,
    )
    return saveAll
  }

  it('stays closed while navigation is not blocked', () => {
    renderUnsaved({ status: 'idle' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('counts the unsaved files in its question', async () => {
    renderUnsaved(blocked())
    expect(await screen.findByText(/2 files have unsaved changes/)).toBeTruthy()
  })

  it('goes on after Save and switch only when every dirty file was written', async () => {
    const blocker = blocked()
    const saveAll = renderUnsaved(blocker)
    await userEvent.click(await screen.findByRole('button', { name: 'Save and switch' }))
    await waitFor(() => expect(blocker.proceed).toHaveBeenCalledTimes(1))
    expect(saveAll).toHaveBeenCalledTimes(1)
  })

  it('cancels the navigation when a save fell short', async () => {
    const blocker = blocked()
    renderUnsaved(blocker, { saveAll: vi.fn().mockResolvedValue(1) })
    await userEvent.click(await screen.findByRole('button', { name: 'Save and switch' }))
    await waitFor(() => expect(blocker.reset).toHaveBeenCalledTimes(1))
    expect(blocker.proceed).not.toHaveBeenCalled()
  })

  it('forgets the stored drafts when leaving without saving', async () => {
    useIdeStore.getState().setDraft('a.ts', 'x', 'ha')
    const blocker = blocked()
    renderUnsaved(blocker, { canEdit: false })
    await userEvent.click(await screen.findByRole('button', { name: /^Open / }))
    expect(useIdeStore.getState().drafts).toEqual({})
    expect(blocker.proceed).toHaveBeenCalledTimes(1)
  })

  it('offers Review… only where the workspace is shown and editable', async () => {
    const blocker = blocked()
    const { unmount } = render(
      <WorkspaceUnsavedDialog
        blocker={blocker}
        dirtyCount={1}
        canEdit
        wideEnough
        saving={false}
        saveAll={vi.fn()}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Review…' }))
    expect(blocker.reset).toHaveBeenCalledTimes(1)
    expect(useIdeStore.getState().activePath).toBe('ide:review')
    unmount()

    renderUnsaved(blocked(), { wideEnough: false })
    await screen.findByRole('alertdialog')
    expect(screen.queryByRole('button', { name: 'Review…' })).toBeNull()
  })
})
