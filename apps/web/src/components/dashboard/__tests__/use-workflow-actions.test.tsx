import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { WorkflowSummary } from '../../../lib/api-client'
import { ItemTestScope } from '../../../__tests__/fixtures/item-scope'
import { useWorkflowActions } from '../use-workflow-actions'

const calls = vi.hoisted(() => ({ takedown: vi.fn() }))

vi.mock('../../../lib/api-client', () => ({
  api: {
    takedownDeployment: (workflowId: string, connectionId: string) => {
      calls.takedown(workflowId, connectionId)
      return Promise.resolve({ success: true })
    },
  },
}))
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => vi.fn() }))

const WORKFLOW: WorkflowSummary = {
  id: 'wf_1',
  name: 'Lead enrichment',
  kind: 'workflow',
  currentVersionId: 'v3',
  createdAt: '',
  updatedAt: '',
}

describe('useWorkflowActions › takedown', () => {
  it('takes down from the account it is given, then refreshes what is live where', async () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <ItemTestScope>{children}</ItemTestScope>
        </QueryClientProvider>
      )
    }
    const { result } = renderHook(() => useWorkflowActions(WORKFLOW), { wrapper })
    await act(() => result.current.takedown.mutateAsync('conn-a'))
    expect(calls.takedown).toHaveBeenCalledWith('wf_1', 'conn-a')
    // It may still be live on another account: the Take down dialog names it from here.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deploy-connections', 'wf_1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deployments', 'wf_1'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workflow-full', 'wf_1'] })
  })
})
