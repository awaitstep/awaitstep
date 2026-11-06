import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { SourceFile, WorkflowFull, WorkflowSource } from '../../lib/api-client'
import type { DraftUndo } from '../../lib/ide/draft-undo'
import { actionToast } from '../../lib/action-toast'
import { useIdeExplorerStore } from '../../stores/ide-explorer-store'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { useIdeStore } from '../../stores/ide-store'
import { useQuickTestStore } from '../../stores/quick-test-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { WORKFLOW_ID } from '../../__tests__/fixtures/workspace-queries'
import { useWorkspaceLifecycle } from '../use-workspace-lifecycle'

vi.mock('../use-compare-cache', () => ({ useCompareCache: () => {} }))
vi.mock('../../lib/action-toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actionToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const FILES: SourceFile[] = [
  { path: 'workflow.ts', source: 'export {}\n', role: 'entry', hash: 'h1' },
  { path: 'lib/a.ts', source: 'a\n', role: 'module', hash: 'h2' },
]

function sourceOf(overrides: Partial<WorkflowSource> = {}): WorkflowSource {
  return {
    files: FILES,
    primary: 'lib/a.ts',
    entry: 'workflow.ts',
    manifest: null,
    versionId: 'v-2',
    diagnostics: [],
    ...overrides,
  } as WorkflowSource
}

function fullOf(name = 'Orders', withVersion = true): WorkflowFull {
  return {
    workflow: { id: WORKFLOW_ID, name, kind: 'workflow', currentVersionId: 'v-2' },
    version: withVersion ? { id: 'v-2', version: 2 } : null,
    versions: [],
    handlers: { modules: [] },
    activeDeployment: null,
  } as unknown as WorkflowFull
}

type Input = Parameters<typeof useWorkspaceLifecycle>[0]

function inputOf(overrides: Partial<Input> = {}): Input {
  const source = sourceOf()
  return {
    workflowId: WORKFLOW_ID,
    fileParam: undefined,
    fullData: fullOf(),
    fullError: null,
    sourceError: null,
    source,
    baseline: new Map(source.files.map((f) => [f.path, f])),
    ghostPaths: [],
    draftUndo: { dispose: vi.fn() } as unknown as DraftUndo,
    ...overrides,
  }
}

function setup(initial: Input) {
  return renderHook((props: Input) => useWorkspaceLifecycle(props), { initialProps: initial })
}

beforeEach(() => {
  vi.mocked(actionToast.error).mockClear()
  useIdeStore.getState().resetSession()
  useWorkflowStore.getState().reset()
})
afterEach(() => vi.restoreAllMocks())

describe('useWorkspaceLifecycle hydration', () => {
  it('hydrates the canvas store from the loaded workflow, read-only', () => {
    setup(inputOf())
    expect(useWorkflowStore.getState().workflowId).toBe(WORKFLOW_ID)
    expect(useWorkflowStore.getState().metadata.name).toBe('Orders')
    expect(useWorkflowStore.getState().readOnly).toBe(true)
  })

  it('hydrates again when the loaded data changes, and not on an unrelated re-render', () => {
    const input = inputOf()
    const { rerender } = setup(input)
    useWorkflowStore.setState({
      metadata: { ...useWorkflowStore.getState().metadata, name: 'edited elsewhere' },
    })

    rerender({ ...input })
    expect(useWorkflowStore.getState().metadata.name).toBe('edited elsewhere')

    rerender({ ...input, fullData: fullOf('Renamed') })
    expect(useWorkflowStore.getState().metadata.name).toBe('Renamed')
  })

  it('does not hydrate before the workflow has loaded', () => {
    setup(inputOf({ fullData: undefined }))
    expect(useWorkflowStore.getState().workflowId).toBeNull()
  })
})

describe('useWorkspaceLifecycle tabs', () => {
  it('opens the primary file when nothing is open', () => {
    setup(inputOf())
    expect(useIdeStore.getState().activePath).toBe('lib/a.ts')
  })

  it('falls back to the entry file when there is no primary', () => {
    setup(inputOf({ source: sourceOf({ primary: undefined as unknown as string }) }))
    expect(useIdeStore.getState().activePath).toBe('workflow.ts')
  })

  it('opens the deep-linked file over the primary one', () => {
    setup(inputOf({ fileParam: '/workflow.ts' }))
    expect(useIdeStore.getState().activePath).toBe('workflow.ts')
  })

  it('ignores a deep link to a file the bundle does not have', () => {
    setup(inputOf({ fileParam: 'missing.ts' }))
    expect(useIdeStore.getState().activePath).toBe('lib/a.ts')
  })

  it('leaves the tab the user already has open alone', () => {
    useIdeStore.getState().openFile('workflow.ts')
    setup(inputOf({ fileParam: 'lib/a.ts' }))
    expect(useIdeStore.getState().activePath).toBe('workflow.ts')
  })

  it('opens nothing before the source has loaded', () => {
    setup(inputOf({ source: undefined }))
    expect(useIdeStore.getState().activePath).toBeNull()
  })

  it('neither opens nor prunes before the workflow has loaded: the baseline has no step files yet', () => {
    const store = useIdeStore.getState()
    store.openFile('steps/k3j9x_a1b2c3.ts')
    store.setDraft('steps/k3j9x_a1b2c3.ts', 'return 2', 'hs1')
    setup(inputOf({ fullData: undefined, baseline: new Map() }))
    expect(useIdeStore.getState().openPaths).toEqual(['steps/k3j9x_a1b2c3.ts'])
    expect(useIdeStore.getState().drafts['steps/k3j9x_a1b2c3.ts']).toBeDefined()
  })

  it('prunes tabs for files that are gone but keeps a ghost that still holds edits', () => {
    const store = useIdeStore.getState()
    store.openFile('workflow.ts')
    store.openFile('deleted.ts')
    store.openFile('ghost.ts')
    store.setDraft('ghost.ts', 'edited', 'h9')
    setup(inputOf({ ghostPaths: ['ghost.ts'] }))
    const open = useIdeStore.getState().openPaths
    expect(open).toContain('workflow.ts')
    expect(open).toContain('ghost.ts')
    expect(open).not.toContain('deleted.ts')
  })

  it('drops a draft that now equals the saved file', () => {
    useIdeStore.getState().openFile('workflow.ts')
    useIdeStore.getState().setDraft('workflow.ts', 'export {}\n', 'h1')
    setup(inputOf())
    expect(useIdeStore.getState().drafts['workflow.ts']).toBeUndefined()
  })
})

describe('useWorkspaceLifecycle for a workflow with no saved version', () => {
  const PROJECT_FILES: SourceFile[] = [
    { path: 'lib/a.ts', source: 'a\n', role: 'module', hash: 'h2' },
  ]
  function blank(overrides: Partial<Input> = {}): Input {
    const source = sourceOf({ versionId: null, entry: null, primary: null, files: PROJECT_FILES })
    return inputOf({
      fullData: fullOf('Orders', false),
      source,
      baseline: new Map(PROJECT_FILES.map((f) => [f.path, f])),
      ...overrides,
    })
  }

  it('opens nothing by itself, without throwing, when there is no entry to land on', () => {
    setup(blank())
    expect(useIdeStore.getState().activePath).toBeNull()
    expect(useIdeStore.getState().openPaths).toEqual([])
  })

  it('still opens a deep-linked project file', () => {
    setup(blank({ fileParam: 'lib/a.ts' }))
    expect(useIdeStore.getState().activePath).toBe('lib/a.ts')
  })

  it('empties a graph the canvas left in the store: a discarded, never-saved drawing must not show in the IDE', () => {
    // What "Discard and switch" leaves behind: the canvas does not reset the
    // store on its way out, and a workflow with no version has no graph to
    // overwrite it with.
    useWorkflowStore.setState({
      nodes: [{ id: 'n1', type: 'step', position: { x: 0, y: 0 }, data: {} }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
      selectedNodeId: 'n1',
    } as never)
    setup(blank())
    const state = useWorkflowStore.getState()
    expect(state.workflowId).toBe(WORKFLOW_ID)
    expect(state.nodes).toEqual([])
    expect(state.edges).toEqual([])
    expect(state.selectedNodeId).toBeNull()
    expect(state.readOnly).toBe(true)
    expect(state.isDirty).toBe(false)
  })

  it('empties the store again when the workspace closes, so the canvas starts from the server', () => {
    const view = setup(blank())
    view.unmount()
    expect(useWorkflowStore.getState().nodes).toEqual([])
    expect(useWorkflowStore.getState().workflowId).toBeNull()
  })
})

describe('useWorkspaceLifecycle load errors', () => {
  it('toasts a failed workflow load', () => {
    setup(inputOf({ fullData: undefined, fullError: new Error('boom') }))
    expect(actionToast.error).toHaveBeenCalledTimes(1)
    expect(vi.mocked(actionToast.error).mock.calls[0]![0]).toContain('boom')
  })

  it('toasts a failed source load when the workflow has a version', () => {
    setup(inputOf({ source: undefined, sourceError: new Error('no source') }))
    expect(actionToast.error).toHaveBeenCalledTimes(1)
  })

  it('toasts a failed source load for a workflow without a version too: a blank one reads fine now', () => {
    setup(
      inputOf({
        fullData: fullOf('Orders', false),
        source: undefined,
        sourceError: new Error('500'),
      }),
    )
    expect(actionToast.error).toHaveBeenCalledTimes(1)
  })

  it('does not toast when nothing failed', () => {
    setup(inputOf())
    expect(actionToast.error).not.toHaveBeenCalled()
  })
})

describe('useWorkspaceLifecycle cleanup', () => {
  it('resets the session, the other stores and the undo helper on unmount', () => {
    const input = inputOf()
    const view = setup(input)
    useIdeStore.getState().setDraft('workflow.ts', 'x', 'h1')
    useIdeExplorerStore.setState({ focusPath: 'workflow.ts' })
    useQuickTestStore.setState({ views: { 'workflow.ts': { running: false } as never } })
    expect(useIdeStore.getState().openPaths.length).toBeGreaterThan(0)

    view.unmount()

    expect(input.draftUndo.dispose).toHaveBeenCalledTimes(1)
    expect(useIdeStore.getState().openPaths).toEqual([])
    expect(useIdeStore.getState().drafts).toEqual({})
    expect(useWorkflowStore.getState().workflowId).toBeNull()
    expect(useIdeExplorerStore.getState().focusPath).toBeNull()
    expect(useIdeSearchStore.getState().query).toBe('')
    expect(useQuickTestStore.getState().views).toEqual({})
  })

  it('does not reset on a plain re-render', () => {
    const input = inputOf()
    const { rerender } = setup(input)
    rerender({ ...input })
    expect(input.draftUndo.dispose).not.toHaveBeenCalled()
    expect(useIdeStore.getState().openPaths.length).toBeGreaterThan(0)
  })
})
