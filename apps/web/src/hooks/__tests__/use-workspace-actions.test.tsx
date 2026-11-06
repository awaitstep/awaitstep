import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SourceFile } from '../../lib/api-client'
import { useIdeExplorerStore } from '../../stores/ide-explorer-store'
import { useIdeStore } from '../../stores/ide-store'
import { useWorkspaceActions } from '../use-workspace-actions'
import type { ProjectFilesController } from '../use-project-files'
import { ItemTestScope } from '../../__tests__/fixtures/item-scope'

const navigate = vi.hoisted(() => vi.fn())
const back = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouter: () => ({ history: { back } }),
}))

const baseline = new Map<string, SourceFile>([
  ['workflow.ts', { path: 'workflow.ts', source: 'a', role: 'entry', hash: 'h1' }],
  ['handlers.ts', { path: 'handlers.ts', source: 'b', role: 'handlers', hash: 'h2' }],
  ['gen.ts', { path: 'gen.ts', source: 'c', role: 'config' }],
])

function projectFilesStub() {
  return {
    busy: false,
    saveAll: vi.fn().mockResolvedValue(1),
    saveFile: vi.fn().mockResolvedValue(true),
    createFile: vi.fn().mockResolvedValue(true),
  } as unknown as ProjectFilesController & {
    saveAll: ReturnType<typeof vi.fn>
    saveFile: ReturnType<typeof vi.fn>
    createFile: ReturnType<typeof vi.fn>
  }
}

function setup(overrides: { canEdit?: boolean; wideEnough?: boolean } = {}) {
  const projectFiles = projectFilesStub()
  const draftUndo = {
    discardAll: vi.fn(),
    revertFile: vi.fn(),
    takeServerVersion: vi.fn(),
    discardDeleted: vi.fn(),
    dispose: vi.fn(),
  }
  const sessionActions = {
    run: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
    triggerSession: vi.fn(),
  }
  const searchActions = {
    findInFiles: vi.fn(),
    nextSearchHit: vi.fn(),
    prevSearchHit: vi.fn(),
    nextSearchHitKey: vi.fn(),
    prevSearchHitKey: vi.fn(),
    showImporters: vi.fn(),
  }
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ItemTestScope>{children}</ItemTestScope>
    </QueryClientProvider>
  )
  const hook = renderHook(
    () =>
      useWorkspaceActions({
        workflowId: 'wf_1',
        versionParam: undefined,
        wideEnough: overrides.wideEnough ?? true,
        canEdit: overrides.canEdit ?? true,
        readOnlyMessage: null,
        baseline,
        files: baseline,
        dirty: new Set<string>(),
        storedPaths: new Set(['workflow.ts', 'handlers.ts']),
        editabilityOf: () => ({ readOnly: false, message: null }),
        ownerOf: () => 'project',
        projectFiles,
        searchActions,
        draftUndo,
        sessionActions,
      }),
    { wrapper },
  )
  return { ...hook, projectFiles, draftUndo, sessionActions, searchActions }
}

function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  document.body.dispatchEvent(event)
}

beforeEach(() => {
  navigate.mockReset()
  useIdeStore.getState().resetSession()
  useIdeExplorerStore.getState().reset()
})
afterEach(() => useIdeStore.getState().resetSession())

describe('useWorkspaceActions commands', () => {
  it('saves everything only when the workspace accepts edits', () => {
    const editable = setup({ canEdit: true })
    act(() => editable.result.current.actions.saveAll())
    expect(editable.projectFiles.saveAll).toHaveBeenCalledTimes(1)

    const readOnly = setup({ canEdit: false })
    act(() => readOnly.result.current.actions.saveAll())
    expect(readOnly.projectFiles.saveAll).not.toHaveBeenCalled()
  })

  it('starts a new file in the explorer only when editing is allowed', () => {
    const readOnly = setup({ canEdit: false })
    act(() => readOnly.result.current.actions.newFile())
    expect(useIdeExplorerStore.getState().create).toBeNull()

    const editable = setup()
    act(() => editable.result.current.actions.newFile())
    expect(useIdeExplorerStore.getState().create).not.toBeNull()
  })

  it('renames and deletes only a stored active file, never a generated one', () => {
    const { result } = setup()
    useIdeStore.getState().openFile('gen.ts')
    act(() => result.current.actions.renameFile())
    act(() => result.current.actions.deleteFile())
    expect(useIdeStore.getState().dialog).toBeNull()
    expect(useIdeExplorerStore.getState().renaming).toBeNull()

    act(() => useIdeStore.getState().openFile('workflow.ts'))
    act(() => result.current.actions.renameFile())
    expect(useIdeExplorerStore.getState().renaming).toBe('workflow.ts')
    act(() => result.current.actions.deleteFile())
    expect(useIdeStore.getState()).toMatchObject({
      dialog: 'deleteFile',
      dialogTarget: 'workflow.ts',
    })
  })

  it('opens the conversion dialog at once when handlers.ts has no unsaved edits', () => {
    const { result, projectFiles } = setup()
    act(() => result.current.actions.convertHandlers())
    expect(useIdeStore.getState().dialog).toBe('convertHandlers')
    expect(projectFiles.saveFile).not.toHaveBeenCalled()
  })

  it('saves an unsaved handlers.ts before it opens the conversion dialog, and stays shut if the save fails', async () => {
    const { result, projectFiles } = setup()
    useIdeStore.getState().setDraft('handlers.ts', 'edited', 'h2')
    projectFiles.saveFile.mockResolvedValueOnce(false)
    await act(async () => result.current.actions.convertHandlers())
    expect(projectFiles.saveFile).toHaveBeenCalledWith('handlers.ts')
    expect(useIdeStore.getState().dialog).toBeNull()

    await act(async () => result.current.actions.convertHandlers())
    expect(useIdeStore.getState().dialog).toBe('convertHandlers')
  })

  it('does not convert while editing is not allowed', () => {
    const { result } = setup({ canEdit: false })
    act(() => result.current.actions.convertHandlers())
    expect(useIdeStore.getState().dialog).toBeNull()
  })

  it('closes the active file through the close request', () => {
    const { result } = setup()
    act(() => useIdeStore.getState().openFile('workflow.ts'))
    act(() => result.current.actions.closeActiveFile())
    expect(useIdeStore.getState().openPaths).not.toContain('workflow.ts')
  })

  it('opens the canvas on the version being viewed', () => {
    const { result } = setup()
    act(() => result.current.handleOpenCanvas())
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.objectContaining({ view: 'canvas' }) }),
    )
  })

  it('goes back through the router', () => {
    const { result } = setup()
    result.current.handleBack()
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('reveals a created file at line 1 and reports whether it was created', async () => {
    const { result, projectFiles } = setup()
    let created = false
    await act(async () => {
      created = await result.current.handleCreateFile('new.ts')
    })
    expect(created).toBe(true)
    expect(useIdeStore.getState().reveal).toMatchObject({ path: 'new.ts', line: 1 })

    projectFiles.createFile.mockResolvedValueOnce(false)
    useIdeStore.getState().resetSession()
    await act(async () => {
      created = await result.current.handleCreateFile('bad.ts')
    })
    expect(created).toBe(false)
    expect(useIdeStore.getState().reveal).toBeNull()
  })

  it('clears a draft that equals the saved text instead of keeping it', () => {
    const { result } = setup()
    act(() => result.current.handleEditorChange('workflow.ts', 'changed'))
    expect(useIdeStore.getState().drafts['workflow.ts']).toEqual({
      source: 'changed',
      baseHash: 'h1',
    })
    act(() => result.current.handleEditorChange('workflow.ts', 'a'))
    expect(useIdeStore.getState().drafts['workflow.ts']).toBeUndefined()
  })
})

describe('useWorkspaceActions shortcuts', () => {
  it('opens Quick Open from the keyboard in a wide window', () => {
    setup({ wideEnough: true })
    press({ key: 'p', code: 'KeyP', ctrlKey: true })
    expect(useIdeStore.getState().dialog).toBe('quickOpen')
  })

  it('opens the command palette from the keyboard', () => {
    setup()
    press({ key: 'p', code: 'KeyP', ctrlKey: true, shiftKey: true })
    expect(useIdeStore.getState().dialog).toBe('palette')
  })

  it('ignores every shortcut while the window is too narrow', () => {
    const { projectFiles } = setup({ wideEnough: false })
    press({ key: 'p', code: 'KeyP', ctrlKey: true })
    press({ key: 's', code: 'KeyS', ctrlKey: true, altKey: true })
    expect(useIdeStore.getState().dialog).toBeNull()
    expect(projectFiles.saveAll).not.toHaveBeenCalled()
  })

  it('saves everything from the keyboard when editing is allowed', () => {
    const { projectFiles } = setup()
    press({ key: 's', code: 'KeyS', ctrlKey: true, altKey: true })
    expect(projectFiles.saveAll).toHaveBeenCalledTimes(1)
  })
})
