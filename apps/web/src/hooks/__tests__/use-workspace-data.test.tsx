import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  createWorkspaceClient,
  seedWorkspaceQueries,
  WORKFLOW_ID,
  workspaceWrapper,
} from '../../__tests__/fixtures/workspace-queries'
import { useIdeStore } from '../../stores/ide-store'
import { useWorkspaceData } from '../use-workspace-data'
import type * as ApiClientContext from '../../contexts/api-client-context'

vi.mock('../../contexts/api-client-context', async (original) => ({
  ...(await original<typeof ApiClientContext>()),
  useApiReady: () => true,
}))
vi.mock('../use-workspace-problems', () => ({ useWorkspaceProblems: () => [] }))

function setup(versionParam?: string, options: Parameters<typeof seedWorkspaceQueries>[1] = {}) {
  const client = createWorkspaceClient()
  seedWorkspaceQueries(client, { ...options, versionParam })
  return renderHook(() => useWorkspaceData(WORKFLOW_ID, versionParam), {
    wrapper: workspaceWrapper(client),
  })
}

beforeEach(() => useIdeStore.getState().resetSession())
afterEach(() => useIdeStore.getState().resetSession())

describe('useWorkspaceData', () => {
  it('lists the stored files as the baseline and marks only hashed ones as project-owned', () => {
    const { result } = setup()
    expect([...result.current.baseline.keys()]).toEqual(['workflow.ts', 'generated.ts'])
    expect([...result.current.storedPaths]).toEqual(['workflow.ts'])
    expect(result.current.storedHashes).toEqual({ 'workflow.ts': 'h1' })
    expect(result.current.canEdit).toBe(true)
  })

  it('counts a draft that differs from the baseline as dirty, and one that matches as clean', () => {
    const { result, rerender } = setup()
    expect(result.current.dirty.size).toBe(0)
    useIdeStore.getState().setDraft('workflow.ts', 'changed', 'h1')
    rerender()
    expect([...result.current.dirty]).toEqual(['workflow.ts'])
    expect(result.current.files.get('workflow.ts')?.source).toBe('changed')
    useIdeStore.getState().setDraft('workflow.ts', 'export {}\n', 'h1')
    rerender()
    expect(result.current.dirty.size).toBe(0)
  })

  it('keeps a file deleted on the server while it holds edits, as an editable ghost', () => {
    const { result, rerender } = setup()
    useIdeStore.getState().setDraft('gone.ts', 'edited', 'h9')
    rerender()
    expect(result.current.ghostPaths).toEqual(['gone.ts'])
    expect(result.current.files.has('gone.ts')).toBe(true)
    expect(result.current.projectPaths.has('gone.ts')).toBe(true)
    expect(result.current.editabilityOf('gone.ts').readOnly).toBe(false)
  })

  it('does not treat a never-stored draft as a ghost', () => {
    const { result, rerender } = setup()
    useIdeStore.getState().setDraft('new.ts', 'x', null)
    rerender()
    expect(result.current.ghostPaths).toEqual([])
  })

  it('counts only stored files in the usage', () => {
    const { result } = setup(undefined, {
      workflow: { triggerCode: 'export const handlers = {}' },
      files: [
        { path: 'a.ts', source: 'abc', role: 'module', hash: 'ha' },
        { path: 'b.ts', source: 'defgh', role: 'config' },
      ],
    })
    expect(result.current.usage.files).toBe(1)
  })

  it('offers legacy settings as virtual seed files that are not counted in the usage', () => {
    const { result } = setup(undefined, {
      workflow: { triggerCode: 'export const x = 1' },
      files: [{ path: 'workflow.ts', source: 's', role: 'entry', hash: 'h1' }],
    })
    expect([...result.current.virtualPaths]).toEqual(['handlers.ts'])
    expect(result.current.baseline.has('handlers.ts')).toBe(true)
    expect(result.current.usage.files).toBe(1)
  })

  it('offers no virtual seeds while reading an older version', () => {
    const { result } = setup('v-1', { workflow: { triggerCode: 'export const x = 1' } })
    expect(result.current.virtualPaths.size).toBe(0)
  })

  it('is read-only on an older version and reports which one', () => {
    const { result } = setup('v-1')
    expect(result.current.isHistorical).toBe(true)
    expect(result.current.readOnlyVersion).toBe(1)
    expect(result.current.canEdit).toBe(false)
    expect(result.current.editabilityOf('workflow.ts').readOnly).toBe(true)
  })

  it('is read-only everywhere while the source has not loaded', () => {
    const client = createWorkspaceClient()
    const { result } = renderHook(() => useWorkspaceData(WORKFLOW_ID, undefined), {
      wrapper: workspaceWrapper(client),
    })
    expect(result.current.workspace).toBeNull()
    expect(result.current.canEdit).toBe(false)
    expect(result.current.baseline.size).toBe(0)
  })
})
