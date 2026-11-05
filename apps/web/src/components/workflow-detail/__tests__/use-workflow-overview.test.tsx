import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useWorkflowOverview } from '../use-workflow-overview'

const page = <T,>(data: T[]) => Promise.resolve({ data, nextCursor: null })

vi.mock('../../../lib/api-client', () => ({
  api: {
    getWorkflow: () =>
      Promise.resolve({ id: 'wf_1', name: 'Lead enrichment', currentVersionId: 'v60' }),
    // Only the newest versions are loaded; the live one is far older.
    listVersions: () => page([{ id: 'v60', version: 60, locked: 0, createdAt: '' }]),
    listDeployments: () =>
      page([
        {
          id: 'd1',
          workflowId: 'wf_1',
          versionId: 'v4',
          status: 'success',
          createdAt: '',
          version: 4,
          versionLocked: 1,
        },
      ]),
    listAllRuns: () => page([]),
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

describe('useWorkflowOverview', () => {
  it('knows the live version and its lock from the deployment, though it isn’t loaded', async () => {
    const { result } = renderHook(() => useWorkflowOverview('wf_1', true), { wrapper })
    await waitFor(() => expect(result.current.hasActiveDeployment).toBe(true))
    expect(result.current.deployedVersion).toEqual({ id: 'v4', version: 4, locked: 1 })
    expect(result.current.deployBlocked).toBe(true)
  })
})
