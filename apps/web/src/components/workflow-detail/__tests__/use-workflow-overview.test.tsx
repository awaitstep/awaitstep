import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useWorkflowOverview } from '../use-workflow-overview'

const page = <T,>(data: T[]) => Promise.resolve({ data, nextCursor: null })

const runReads = vi.hoisted(() => ({ project: vi.fn(), workflow: vi.fn() }))
const live = vi.hoisted(
  () => (id: string, versionId: string, version: number, versionLocked: boolean) => ({
    id,
    name: id,
    deploymentId: `d-${id}`,
    callable: false,
    versionId,
    version,
    versionLocked,
    deployedAt: '',
    deployedByName: null,
  }),
)

vi.mock('../../../lib/api-client', () => ({
  api: {
    getWorkflow: () =>
      Promise.resolve({ id: 'wf_1', name: 'Lead enrichment', currentVersionId: 'v60' }),
    // Only the newest versions are loaded; the live one is far older.
    listVersions: () => page([{ id: 'v60', version: 60, locked: 0, createdAt: '' }]),
    // What is live on each account: v4 on Production (locked), v60 on Staging.
    getDeployConnections: () =>
      Promise.resolve({
        connections: [{ id: 'c-stage' }],
        defaultId: null,
        deployedWith: [live('c-prod', 'v4', 4, true), live('c-stage', 'v60', 60, false)],
      }),
    // The project-wide read the hook used to make (removed from the client since).
    listAllRuns: (...args: unknown[]) => {
      runReads.project(...args)
      return page([])
    },
    listWorkflowRuns: (...args: unknown[]) => {
      runReads.workflow(...args)
      return page([])
    },
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

describe('useWorkflowOverview', () => {
  it('knows the newest live version and its lock per account, though it isn’t loaded', async () => {
    const { result } = renderHook(() => useWorkflowOverview('wf_1', true), { wrapper })
    await waitFor(() => expect(result.current.hasActiveDeployment).toBe(true))
    expect(result.current.deployedVersion).toEqual({ id: 'v4', version: 4, locked: 1 })
    expect(result.current.lockedOn('c-prod')).toBe(true)
    expect(result.current.lockedOn('c-stage')).toBe(false)
    // Staging still takes a deploy: not every live account is locked.
    expect(result.current.deployBlocked).toBe(false)
    // The latest save (v60) is live on Staging.
    expect(result.current.hasUndeployedChanges).toBe(false)
    expect([...result.current.offeredIds]).toEqual(['c-stage'])
  })

  it('reads no runs: the Overview’s run cards fetch their own', async () => {
    const { result } = renderHook(() => useWorkflowOverview('wf_1', true), { wrapper })
    await waitFor(() => expect(result.current.hasActiveDeployment).toBe(true))
    expect(runReads.project).not.toHaveBeenCalled()
    expect(runReads.workflow).not.toHaveBeenCalled()
  })
})
