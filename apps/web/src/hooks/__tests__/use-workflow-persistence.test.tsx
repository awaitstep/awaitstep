import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkflowStore } from '../../stores/workflow-store'

const mocks = vi.hoisted(() => ({
  updateWorkflow: vi.fn(() => Promise.resolve({})),
  createVersion: vi.fn(() => Promise.resolve({})),
  toastError: vi.fn(),
  // What the app's mutation toasts (the real actionToast) would say.
  sonner: { success: vi.fn(), error: vi.fn() },
  goTo: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: mocks.sonner }))

vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: {
    updateWorkflow: mocks.updateWorkflow,
    createVersion: mocks.createVersion,
    createWorkflow: (...args: unknown[]) =>
      (mocks as unknown as { createWorkflow: (...a: unknown[]) => unknown }).createWorkflow(
        ...args,
      ),
  },
}))
vi.mock('../../lib/action-toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actionToast: { success: vi.fn(), error: mocks.toastError, info: vi.fn() },
}))
vi.mock('../../contexts/editor-scope-context', () => ({
  useItemSlugs: () => ({ org: 'acme', project: 'core', workspace: 'sales' }),
}))
vi.mock('../../components/navigation/router-shell-link', () => ({ useGoTo: () => mocks.goTo }))

const { useWorkflowPersistence } = await import('../use-workflow-persistence')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function mount(hasVersion: boolean) {
  return renderHook(
    () =>
      useWorkflowPersistence({
        workflowId: 'wf-1',
        isNew: false,
        isDirty: true,
        hasVersion,
        nodeRegistry: null,
      }),
    { wrapper },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useWorkflowStore.getState().reset()
  useWorkflowStore.getState().setMetadata({ name: 'Renamed' })
})

describe('saving a workflow with nothing drawn and no saved version', () => {
  it('has nothing to store, makes no version, and reports success so the switch goes on', async () => {
    const { result } = mount(false)
    let saved = false
    await act(async () => {
      saved = await result.current.saveNow()
    })
    expect(saved).toBe(true)
    expect(mocks.updateWorkflow).not.toHaveBeenCalled()
    expect(mocks.createVersion).not.toHaveBeenCalled()
    expect(useWorkflowStore.getState().isDirty).toBe(false)
  })

  it('still refuses an empty graph once a version exists: deleting every node is a real change', async () => {
    const { result } = mount(true)
    let saved = true
    await act(async () => {
      saved = await result.current.saveNow()
    })
    expect(saved).toBe(false)
    expect(mocks.updateWorkflow).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('Fix 1 issue before saving')
  })

  it('still refuses when something other than the empty graph is wrong', async () => {
    useWorkflowStore.getState().setMetadata({ name: '' })
    const { result } = mount(false)
    let saved = true
    await act(async () => {
      saved = await result.current.saveNow()
    })
    expect(saved).toBe(false)
    expect(mocks.updateWorkflow).not.toHaveBeenCalled()
  })
})

describe('saving only writes what the canvas owns', () => {
  it('sends the deploy config but never the variables, name or description: another editor or tab may have changed them', async () => {
    useWorkflowStore.getState().setWorkflowEnvVars([{ name: 'SECRET_TOKEN', value: 'old' }])
    useWorkflowStore.setState({
      deployConfig: { route: { pattern: 'a.example.com/*', zoneName: 'example.com' } },
    })
    const { result } = mount(false)
    await act(async () => {
      await result.current.saveNow()
    })
    expect(mocks.updateWorkflow).toHaveBeenCalledTimes(1)
    expect(Object.keys((mocks.updateWorkflow.mock.calls[0] as unknown[])[1] as object)).toEqual([
      'deployConfig',
    ])
  })
})

// ── The shared save: base hash, single flight, Changed in Code ──────────

const { VersionConflictError, ApiError } = await import('../../lib/api-client')
const { SAVE_CONFLICT_MESSAGE } = await import('../use-workflow-persistence')
const { makeQueryClient } = await import('../../lib/query-client')

/** A publishable canvas: one named step with code, under a named workflow. */
function drawStep(graphHash: string | null = 'g1') {
  useWorkflowStore.setState({
    graphHash,
    nodes: [
      {
        id: 'n1',
        type: 'step',
        position: { x: 0, y: 0 },
        data: {
          irNode: {
            id: 'n1',
            type: 'step',
            name: 'Step',
            position: { x: 0, y: 0 },
            version: '1.0.0',
            provider: 'cloudflare',
            data: { code: 'return 1;' },
          },
        },
      },
    ],
    edges: [],
    isDirty: true,
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function baseOf(call: number): string | undefined {
  const data = (mocks.createVersion.mock.calls[call] as unknown[])[1] as { baseGraphHash?: string }
  return data.baseGraphHash
}

describe('the canvas save names its base', () => {
  it('sends the loaded graph hash and keeps the one the save returns for the next save', async () => {
    drawStep('g1')
    mocks.createVersion.mockResolvedValueOnce({ id: 'v2', graphHash: 'g2' })
    const { result } = mount(true)
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true)
    })
    expect(mocks.createVersion).toHaveBeenCalledTimes(1)
    expect(baseOf(0)).toBe('g1')
    expect(useWorkflowStore.getState().graphHash).toBe('g2')
  })

  it('sends no base while nothing is loaded to compare with (a workflow saving its first version)', async () => {
    drawStep(null)
    mocks.createVersion.mockResolvedValueOnce({ id: 'v1', graphHash: 'g1' })
    const { result } = mount(false)
    await act(async () => {
      await result.current.saveNow()
    })
    expect(baseOf(0)).toBeUndefined()
    expect(useWorkflowStore.getState().graphHash).toBe('g1')
  })

  it('lets a save that arrives while one is in flight wait, so it builds on the returned base', async () => {
    drawStep('g1')
    const first = deferred<{ id: string; graphHash: string }>()
    mocks.createVersion.mockReturnValueOnce(first.promise)
    mocks.createVersion.mockResolvedValueOnce({ id: 'v3', graphHash: 'g3' })
    const { result } = mount(true)
    let manual!: Promise<boolean>
    let auto!: Promise<string>
    await act(async () => {
      manual = result.current.saveNow()
      auto = result.current.saveSilent()
      await Promise.resolve()
    })
    // Only the first request has gone out; the autosave is queued behind it.
    expect(mocks.createVersion).toHaveBeenCalledTimes(1)
    await act(async () => {
      first.resolve({ id: 'v2', graphHash: 'g2' })
      expect(await manual).toBe(true)
      expect(await auto).toBe('saved')
    })
    expect(mocks.createVersion).toHaveBeenCalledTimes(2)
    expect(baseOf(0)).toBe('g1')
    expect(baseOf(1)).toBe('g2')
    expect(useWorkflowStore.getState().graphHash).toBe('g3')
  })
})

describe('when Code saved the workflow under the canvas', () => {
  const { sonner, goTo } = mocks

  /** A client with the app's mutation toasts, so the generic save toast is on trial too. */
  function appWrapper() {
    const client = makeQueryClient()
    return {
      client,
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  }

  function mountIn(wrapper: (p: { children: ReactNode }) => React.JSX.Element, isDirty = true) {
    return renderHook(
      () =>
        useWorkflowPersistence({
          workflowId: 'wf-1',
          isNew: false,
          isDirty,
          hasVersion: true,
          nodeRegistry: null,
        }),
      { wrapper },
    )
  }

  beforeEach(() => {
    sonner.error.mockClear()
    sonner.success.mockClear()
    goTo.mockClear()
  })

  it('refuses the autosave: one toast, the conflict state, the draft kept', async () => {
    drawStep('g1')
    mocks.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v9', 'g9'))
    const { result } = mountIn(appWrapper().wrapper)
    let outcome = ''
    await act(async () => {
      outcome = await result.current.saveSilent()
    })
    expect(outcome).toBe('conflict')
    expect(result.current.saveConflict).toBe(true)
    expect(result.current.saveError).toBeNull()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledWith(SAVE_CONFLICT_MESSAGE)
    expect(useWorkflowStore.getState().isDirty).toBe(true)
    expect(useWorkflowStore.getState().graphHash).toBe('g1')
  })

  it('refuses a manual save the same way, and the generic save toast stays quiet', async () => {
    drawStep('g1')
    mocks.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v9', 'g9'))
    const { result } = mountIn(appWrapper().wrapper)
    let saved = true
    await act(async () => {
      saved = await result.current.saveNow()
    })
    expect(saved).toBe(false)
    expect(result.current.saveConflict).toBe(true)
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledWith(SAVE_CONFLICT_MESSAGE)
    // The mutation's own toast (through the real actionToast) said nothing.
    expect(sonner.error).not.toHaveBeenCalled()
  })

  it('still toasts the generic line for any other refusal of a manual save', async () => {
    drawStep('g1')
    mocks.createVersion.mockRejectedValueOnce(new ApiError('Version is locked', 423))
    const { result } = mountIn(appWrapper().wrapper)
    await act(async () => {
      await result.current.saveNow()
    })
    expect(result.current.saveConflict).toBe(false)
    expect(result.current.saveError).toBe('Version is locked')
    await waitFor(() => expect(sonner.error).toHaveBeenCalledTimes(1))
    expect(sonner.error.mock.calls[0]![0]).toBe('Version is locked')
  })

  it('sends nothing more until Reload: Save, autosave and Deploy all stop at the conflict', async () => {
    drawStep('g1')
    mocks.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v9', 'g9'))
    const { result } = mountIn(appWrapper().wrapper)
    await act(async () => {
      await result.current.saveSilent()
    })
    mocks.toastError.mockClear()
    let manual = true
    let auto = ''
    await act(async () => {
      manual = await result.current.saveNow()
      auto = await result.current.saveSilent()
      await result.current.handleDeploy()
    })
    expect(manual).toBe(false)
    expect(auto).toBe('conflict')
    expect(mocks.createVersion).toHaveBeenCalledTimes(1)
    expect(goTo).not.toHaveBeenCalled()
    // Each refused action says why; the silent autosave says nothing.
    expect(mocks.toastError).toHaveBeenCalledTimes(2)
    expect(mocks.toastError).toHaveBeenNthCalledWith(1, SAVE_CONFLICT_MESSAGE)
    expect(mocks.toastError).toHaveBeenNthCalledWith(2, SAVE_CONFLICT_MESSAGE)
  })

  it('Reload refetches the workflow and clears the conflict; the project files follow', async () => {
    drawStep('g1')
    mocks.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v9', 'g9'))
    const { client, wrapper } = appWrapper()
    const refetch = vi.spyOn(client, 'refetchQueries').mockResolvedValue()
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
    const { result } = mountIn(wrapper)
    await act(async () => {
      await result.current.saveSilent()
    })
    expect(result.current.saveConflict).toBe(true)
    let reloaded = false
    await act(async () => {
      reloaded = await result.current.reload()
    })
    expect(reloaded).toBe(true)
    expect(result.current.saveConflict).toBe(false)
    expect(result.current.reloading).toBe(false)
    expect(refetch).toHaveBeenCalledWith(
      { queryKey: ['workflow-full', 'wf-1'], type: 'active' },
      { throwOnError: true },
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workflow-source', 'wf-1'] })
  })

  it('keeps the conflict when the reload cannot fetch, and adds no toast of its own (the canvas reports the failed load)', async () => {
    drawStep('g1')
    mocks.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v9', 'g9'))
    const { client, wrapper } = appWrapper()
    vi.spyOn(client, 'refetchQueries').mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = mountIn(wrapper)
    await act(async () => {
      await result.current.saveSilent()
    })
    mocks.toastError.mockClear()
    let reloaded = true
    await act(async () => {
      reloaded = await result.current.reload()
    })
    expect(reloaded).toBe(false)
    expect(result.current.saveConflict).toBe(true)
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('writes nothing at all on a refusal: the deploy config waits for the version', async () => {
    drawStep('g1')
    useWorkflowStore.setState({
      deployConfig: { route: { pattern: 'a.example.com/*', zoneName: 'example.com' } },
    })
    mocks.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v9', 'g9'))
    const { result } = mountIn(appWrapper().wrapper)
    await act(async () => {
      await result.current.saveNow()
    })
    expect(mocks.updateWorkflow).not.toHaveBeenCalled()
    // Once the version is in, the config follows.
    mocks.createVersion.mockResolvedValueOnce({ id: 'v2', graphHash: 'g2' })
    useWorkflowStore.setState({ graphHash: 'g9' })
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true)
    })
    expect(mocks.updateWorkflow).toHaveBeenCalledTimes(1)
  })

  it('refuses a save queued behind the refused one without sending it, and without a second toast', async () => {
    drawStep('g1')
    const first = deferred<never>()
    mocks.createVersion.mockReturnValueOnce(first.promise)
    const { result } = mountIn(appWrapper().wrapper)
    let auto!: Promise<string>
    let manual!: Promise<boolean>
    await act(async () => {
      auto = result.current.saveSilent()
      // Deploy or ⌘↵ while the autosave is still out: it queues behind it.
      manual = result.current.saveNow()
      await Promise.resolve()
    })
    expect(mocks.createVersion).toHaveBeenCalledTimes(1)
    await act(async () => {
      first.reject(new VersionConflictError('moved', 'v9', 'g9'))
      expect(await auto).toBe('conflict')
      expect(await manual).toBe(false)
    })
    expect(mocks.createVersion).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledWith(SAVE_CONFLICT_MESSAGE)
    expect(sonner.error).not.toHaveBeenCalled()
    expect(result.current.saveConflict).toBe(true)
  })

  it('ends by itself once any refetch shows the canvas a newer version', async () => {
    drawStep('g1')
    mocks.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v9', 'g9'))
    const { result } = mountIn(appWrapper().wrapper)
    await act(async () => {
      await result.current.saveSilent()
    })
    expect(result.current.saveConflict).toBe(true)
    // The variables dialog (say) invalidated the workflow; the hydration brought the new base.
    act(() => useWorkflowStore.setState({ graphHash: 'g9', isDirty: false }))
    expect(result.current.saveConflict).toBe(false)
    mocks.createVersion.mockResolvedValueOnce({ id: 'v10', graphHash: 'g10' })
    act(() => useWorkflowStore.setState({ isDirty: true }))
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true)
    })
    expect(baseOf(1)).toBe('g9')
  })

  it('reports a refusal of a save that carried no base as a failed save to try again, not a conflict', async () => {
    // A first version: nothing loaded to compare with, yet the server can
    // still refuse when its write lost the race twice.
    drawStep(null)
    mocks.createVersion.mockRejectedValueOnce(
      new VersionConflictError('This workflow changed since it was loaded', 'v1', 'g1'),
    )
    const { result } = mountIn(appWrapper().wrapper)
    let saved = true
    await act(async () => {
      saved = await result.current.saveNow()
    })
    expect(saved).toBe(false)
    expect(result.current.saveConflict).toBe(false)
    expect(result.current.saveError).toBe('This workflow changed since it was loaded')
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledWith('This workflow changed since it was loaded')
    // Nothing holds the canvas back: the next save goes out.
    mocks.createVersion.mockResolvedValueOnce({ id: 'v1', graphHash: 'g1' })
    await act(async () => {
      expect(await result.current.saveNow()).toBe(true)
    })
    expect(mocks.createVersion).toHaveBeenCalledTimes(2)
    // The silent autosave records the failure for the status line and says nothing.
    mocks.toastError.mockClear()
    useWorkflowStore.setState({ graphHash: null, isDirty: true })
    mocks.createVersion.mockRejectedValueOnce(new VersionConflictError('lost', 'v1', 'g1'))
    let outcome = ''
    await act(async () => {
      outcome = await result.current.saveSilent()
    })
    expect(outcome).toBe('failed')
    expect(result.current.saveConflict).toBe(false)
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('belongs to the workflow it was refused for', async () => {
    drawStep('g1')
    mocks.createVersion.mockRejectedValueOnce(new VersionConflictError('moved', 'v9', 'g9'))
    const { wrapper } = appWrapper()
    const view = renderHook(
      (props: { workflowId: string }) =>
        useWorkflowPersistence({
          workflowId: props.workflowId,
          isNew: false,
          isDirty: true,
          hasVersion: true,
          nodeRegistry: null,
        }),
      { wrapper, initialProps: { workflowId: 'wf-1' } },
    )
    await act(async () => {
      await view.result.current.saveSilent()
    })
    expect(view.result.current.saveConflict).toBe(true)
    view.rerender({ workflowId: 'wf-2' })
    expect(view.result.current.saveConflict).toBe(false)
  })
})

describe('the first save of a new workflow', () => {
  const createWorkflow = vi.fn()

  beforeEach(() => {
    createWorkflow.mockReset()
    createWorkflow.mockResolvedValue({ id: 'wf-created', name: 'Renamed' })
    ;(mocks as unknown as { createWorkflow?: unknown }).createWorkflow = createWorkflow
  })

  it('creates the workflow once: a save queued behind it saves into the created one, on its base', async () => {
    drawStep(null)
    useWorkflowStore.setState({ workflowId: 'new' })
    const first = deferred<{ id: string; graphHash: string }>()
    mocks.createVersion.mockReturnValueOnce(first.promise)
    mocks.createVersion.mockResolvedValueOnce({ id: 'v2', graphHash: 'g2' })
    const { result } = renderHook(
      () =>
        useWorkflowPersistence({
          workflowId: 'new',
          isNew: true,
          isDirty: true,
          hasVersion: false,
          nodeRegistry: null,
        }),
      { wrapper },
    )
    let manual!: Promise<boolean>
    let auto!: Promise<string>
    await act(async () => {
      manual = result.current.saveNow()
      auto = result.current.saveSilent()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      first.resolve({ id: 'v1', graphHash: 'g1' })
      expect(await manual).toBe(true)
      expect(await auto).toBe('saved')
    })
    expect(createWorkflow).toHaveBeenCalledTimes(1)
    expect(mocks.createVersion).toHaveBeenCalledTimes(2)
    expect((mocks.createVersion.mock.calls[0] as unknown[])[0]).toBe('wf-created')
    expect(baseOf(0)).toBeUndefined()
    expect((mocks.createVersion.mock.calls[1] as unknown[])[0]).toBe('wf-created')
    expect(baseOf(1)).toBe('g1')
    expect(useWorkflowStore.getState().graphHash).toBe('g2')
  })
})
