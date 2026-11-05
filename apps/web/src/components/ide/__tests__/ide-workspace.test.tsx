import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { useIdeLayoutStore } from '../../../stores/ide-layout-store'
import { useIdeStore } from '../../../stores/ide-store'
import { useIdeExplorerStore } from '../../../stores/ide-explorer-store'
import { useIdeSearchStore } from '../../../stores/ide-search-store'
import { useQuickTestStore } from '../../../stores/quick-test-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import {
  createWorkspaceClient,
  seedWorkspaceQueries,
  WORKFLOW_ID,
} from '../../../__tests__/fixtures/workspace-queries'
import { IdeWorkspace } from '../ide-workspace'

const blocker = vi.hoisted(() => ({
  status: 'idle' as 'idle' | 'blocked',
  proceed: vi.fn(),
  reset: vi.fn(),
}))
const cleanups = vi.hoisted(() => ({ log: [] as string[] }))
const width = vi.hoisted(() => ({ wide: true }))
const conversion = vi.hoisted(() => ({ preview: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({
    status: blocker.status,
    current: { pathname: '/a', search: { view: 'ide' } },
    next: { pathname: '/b', search: {} },
    proceed: blocker.proceed,
    reset: blocker.reset,
  }),
  useRouter: () => ({ history: { back: vi.fn() } }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../../../hooks/use-min-width', () => ({ useMinWidth: () => width.wide }))
vi.mock('../../../hooks/use-workspace-problems', () => ({ useWorkspaceProblems: () => [] }))
vi.mock('../../../stores/org-store', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOrgReady: () => true,
}))
vi.mock('../../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getWorkflowFull: () => new Promise(() => {}),
  getWorkflowSource: () => new Promise(() => {}),
  api: {
    ...(await importOriginal<{ api: object }>()).api,
    previewHandlerConversion: conversion.preview,
  },
}))
vi.mock('../../../hooks/use-workspace-session', () => ({
  useWorkspaceSession: () => ({
    testSession: null,
    runAction: { intent: { label: 'Run', kind: 'ready' }, confirm: null },
    status: null,
    commands: { canStart: true, canStop: false, canTrigger: false },
    actions: {
      run: vi.fn(),
      startSession: vi.fn(),
      stopSession: vi.fn(),
      triggerSession: vi.fn(),
    },
  }),
}))
vi.mock('../../../hooks/use-draft-persistence', async () => {
  const { useEffect } = await import('react')
  return {
    useDraftPersistence: () =>
      useEffect(() => () => void cleanups.log.push('draftPersistence'), []),
  }
})
vi.mock('../../../hooks/use-compare-cache', async () => {
  const { useEffect } = await import('react')
  return {
    useCompareCache: () => useEffect(() => () => void cleanups.log.push('compareCache'), []),
  }
})
vi.mock('../../../hooks/use-search-actions', async () => {
  const { useEffect } = await import('react')
  const noop = () => {}
  return {
    useSearchActions: () => {
      useEffect(() => () => void cleanups.log.push('importerShower'), [])
      return {
        findInFiles: noop,
        nextSearchHit: noop,
        prevSearchHit: noop,
        nextSearchHitKey: noop,
        prevSearchHitKey: noop,
        showImporters: noop,
      }
    },
  }
})
vi.mock('../../../lib/ide/draft-undo', () => ({
  createDraftUndo: () => ({
    discardAll: () => {},
    revertFile: () => {},
    takeServerVersion: () => {},
    discardDeleted: () => {},
    dispose: () => void cleanups.log.push('draftUndo.dispose'),
  }),
}))
vi.mock('../ide-skeleton', () => ({ IdeSkeleton: () => <div data-testid="skeleton" /> }))
vi.mock('../workspace-notices', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  LoadFailure: () => <div data-testid="load-failure" />,
  UnsavedWorkflowNotice: () => <div data-testid="unsaved-workflow" />,
}))
vi.mock('../editor-group', () => ({ EditorGroup: () => <div data-testid="editor-group" /> }))
vi.mock('../file-explorer', () => ({ FileExplorer: () => <div data-testid="explorer" /> }))
vi.mock('../steps-view', () => ({ StepsView: () => null }))
vi.mock('../bottom-dock', () => ({ BottomDock: () => <div data-testid="dock" /> }))
vi.mock('../search-runner', () => ({ SearchRunner: () => null }))
vi.mock('../ide-header', () => ({ IdeHeader: () => <div data-testid="header" /> }))
vi.mock('../command-palette', () => ({ CommandPalette: () => <div data-testid="palette" /> }))
vi.mock('../run-confirm-dialog', () => ({ RunConfirmDialog: () => null }))
vi.mock('../quick-open-dialog', () => ({ QuickOpenDialog: () => null }))
vi.mock('../status-bar', () => ({ StatusBar: () => <div data-testid="status-bar" /> }))
vi.mock('../step-sync-context', () => ({
  StepSyncProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="step-sync">{children}</div>
  ),
}))
vi.mock('../canvas-preview', () => ({ CanvasPreview: () => null }))

function mount(client = createWorkspaceClient(), id = WORKFLOW_ID) {
  const ui = (workflowId: string) => (
    <QueryClientProvider client={client}>
      <IdeWorkspace workflowId={workflowId} />
    </QueryClientProvider>
  )
  const view = render(ui(id))
  return { client, ...view, rerenderWith: (workflowId: string) => view.rerender(ui(workflowId)) }
}

beforeEach(() => {
  cleanups.log = []
  conversion.preview.mockReset()
  useIdeLayoutStore.setState({ explorerOpen: true, dockOpen: true, previewOpen: true })
  blocker.status = 'idle'
  width.wide = true
  useIdeStore.getState().resetSession()
  window.matchMedia ??= (() => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => useIdeStore.getState().resetSession())

describe('IdeWorkspace', () => {
  it('shows the unsaved-workflow notice for a workflow that does not exist yet', () => {
    const { client } = mount(createWorkspaceClient(), 'new')
    expect(screen.getByTestId('unsaved-workflow')).toBeTruthy()
    expect(client.isFetching()).toBe(0)
  })

  it('shows the skeleton while loading, then the workspace once the data arrives', () => {
    const { client, rerenderWith } = mount()
    expect(screen.getByTestId('skeleton')).toBeTruthy()
    seedWorkspaceQueries(client)
    rerenderWith(WORKFLOW_ID)
    expect(screen.queryByTestId('skeleton')).toBeNull()
    expect(screen.getByTestId('editor-group')).toBeTruthy()
  })

  it('renders the editor area, status bar and dock inside the step-sync provider with every dialog closed', () => {
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client)
    mount(client)
    expect(screen.getByTestId('step-sync').contains(screen.getByTestId('editor-group'))).toBe(true)
    expect(screen.getByTestId('status-bar')).toBeTruthy()
    expect(screen.getByTestId('header')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByText(/wider window/)).toBeNull()
  })

  it('opens the workspace, not a notice, for a workflow without a version', () => {
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client, { files: [] })
    client.setQueryData(['workflow-full', WORKFLOW_ID, undefined], {
      workflow: { id: WORKFLOW_ID, name: 'Orders', kind: 'workflow', currentVersionId: null },
      version: null,
      versions: [],
      handlers: { modules: [] },
    })
    client.setQueryData(['workflow-source', WORKFLOW_ID, undefined], {
      versionId: null,
      entry: null,
      primary: null,
      files: [],
      manifest: null,
      requirements: [],
      diagnostics: [],
    })
    mount(client)
    expect(screen.getByTestId('editor-group')).toBeTruthy()
    expect(screen.queryByText(/no saved version yet/)).toBeNull()
  })

  it('keeps the skeleton while the source is still loading', () => {
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client)
    client.removeQueries({ queryKey: ['workflow-source'] })
    mount(client)
    expect(screen.getByTestId('skeleton')).toBeTruthy()
    expect(screen.queryByTestId('editor-group')).toBeNull()
  })

  it('steps aside for a narrow window without the workspace', () => {
    width.wide = false
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client)
    mount(client)
    expect(screen.getByText('The code workspace needs a wider window')).toBeTruthy()
    expect(screen.queryByTestId('editor-group')).toBeNull()
    expect(screen.queryByTestId('step-sync')).toBeNull()
  })

  it('still shows the unsaved-changes dialog in a narrow window when navigation is blocked', () => {
    width.wide = false
    blocker.status = 'blocked'
    useIdeStore.getState().setDraft('workflow.ts', 'changed', 'h1')
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client)
    mount(client)
    expect(screen.getByText('The code workspace needs a wider window')).toBeTruthy()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText(/One file has unsaved changes/)).toBeTruthy()
  })

  it('shows the explorer and dock panes only while the layout store has them open', () => {
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client)
    useIdeLayoutStore.setState({ explorerOpen: false, dockOpen: false })
    mount(client)
    expect(screen.getByTestId('editor-group')).toBeTruthy()
    expect(document.getElementById('explorer')).toBeNull()
    expect(document.getElementById('dock')).toBeNull()
    act(() => useIdeLayoutStore.setState({ explorerOpen: true, dockOpen: true }))
    expect(document.getElementById('explorer')).not.toBeNull()
    expect(document.getElementById('dock')).not.toBeNull()
  })

  it('moves between the narrow notice and the workspace without breaking hook order', () => {
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client)
    const { rerenderWith } = mount(client)
    expect(screen.getByTestId('editor-group')).toBeTruthy()
    width.wide = false
    rerenderWith(WORKFLOW_ID)
    expect(screen.getByText('The code workspace needs a wider window')).toBeTruthy()
    width.wide = true
    rerenderWith(WORKFLOW_ID)
    expect(screen.getByTestId('editor-group')).toBeTruthy()
  })

  it('keeps the open convert dialog\u2019s plan across a narrow window instead of fetching it again', async () => {
    conversion.preview.mockResolvedValue({
      source: 'file',
      paths: ['handlers/a.ts'],
      declarations: {},
    })
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client)
    const { rerenderWith } = mount(client)
    act(() => useIdeStore.getState().showDialog('convertHandlers'))
    const planText = /handlers\.ts is replaced by handlers\/a\.ts/
    expect(await screen.findByText(planText)).toBeTruthy()
    expect(conversion.preview).toHaveBeenCalledTimes(1)

    width.wide = false
    rerenderWith(WORKFLOW_ID)
    expect(screen.getByText('The code workspace needs a wider window')).toBeTruthy()
    // Long enough for a query nobody observes (gcTime 0) to be collected.
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)))
    width.wide = true
    rerenderWith(WORKFLOW_ID)

    expect(screen.getByText(planText)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Convert' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)))
    expect(conversion.preview).toHaveBeenCalledTimes(1)
  })

  it('keeps one tab list per workflow by remounting when the workflow changes', () => {
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client)
    const { rerenderWith } = mount(client)
    expect(useIdeStore.getState().activePath).toBe('workflow.ts')
    rerenderWith('wf_other')
    expect(useIdeStore.getState().activePath).toBeNull()
  })
})

describe('IdeWorkspace unmount', () => {
  const restores: (() => void)[] = []
  afterEach(() => {
    while (restores.length > 0) restores.pop()?.()
  })

  function logReset<T extends { reset: () => void }>(
    store: { getState: () => T; setState: (patch: Partial<T>) => void },
    name: string,
  ) {
    const real = store.getState().reset
    store.setState({
      reset: () => {
        cleanups.log.push(name)
        real()
      },
    } as Partial<T>)
    restores.push(() => store.setState({ reset: real } as Partial<T>))
  }

  it('unsubscribes draft persistence, the compare cache and the importer shower before the session is reset', () => {
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client)
    const view = mount(client)
    const realReset = useIdeStore.getState().resetSession
    useIdeStore.setState({
      resetSession: () => {
        cleanups.log.push('resetSession')
        realReset()
      },
    })
    restores.push(() => useIdeStore.setState({ resetSession: realReset }))
    logReset(useWorkflowStore, 'workflowStore.reset')
    logReset(useIdeExplorerStore, 'explorer.reset')
    logReset(useIdeSearchStore, 'search.reset')
    logReset(useQuickTestStore, 'quickTest.reset')

    view.unmount()

    const at = (name: string) => cleanups.log.indexOf(name)
    for (const name of ['draftPersistence', 'importerShower', 'compareCache']) {
      expect(at(name), name).toBeGreaterThanOrEqual(0)
      expect(at(name), name).toBeLessThan(at('resetSession'))
    }
    expect(at('draftPersistence')).toBeLessThan(at('compareCache'))
    // The single reset cleanup runs in this order, as in the original component.
    expect(cleanups.log.slice(at('draftUndo.dispose'))).toEqual([
      'draftUndo.dispose',
      'workflowStore.reset',
      'resetSession',
      'explorer.reset',
      'search.reset',
      'quickTest.reset',
    ])
  })

  it('leaves the stores\u2019 own reset functions in place after a test replaced them', () => {
    expect(useIdeStore.getState().resetSession.toString()).not.toContain('cleanups')
    expect(useWorkflowStore.getState().reset.toString()).not.toContain('cleanups')
  })
})
