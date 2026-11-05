import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkflowStore } from '../../stores/workflow-store'

const mocks = vi.hoisted(() => ({
  updateWorkflow: vi.fn(() => Promise.resolve({})),
  createVersion: vi.fn(() => Promise.resolve({})),
  toastError: vi.fn(),
}))

vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: { updateWorkflow: mocks.updateWorkflow, createVersion: mocks.createVersion },
}))
vi.mock('../../lib/action-toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  actionToast: { success: vi.fn(), error: mocks.toastError, info: vi.fn() },
}))
vi.mock('../../contexts/editor-scope-context', () => ({
  useItemSlugs: () => ({ org: 'acme', project: 'core', workspace: 'sales' }),
}))
vi.mock('../../components/navigation/router-shell-link', () => ({ useGoTo: () => vi.fn() }))

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
  it('stores the settings without a version, and reports success so the switch goes on', async () => {
    const { result } = mount(false)
    let saved = false
    await act(async () => {
      saved = await result.current.saveNow()
    })
    expect(saved).toBe(true)
    expect(mocks.updateWorkflow).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({ name: 'Renamed' }),
    )
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
