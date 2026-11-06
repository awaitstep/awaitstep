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

const STEP_IR = {
  kind: 'workflow',
  metadata: { name: 'Orders', version: 2, createdAt: 't', updatedAt: 't' },
  nodes: [
    {
      id: 'validate',
      type: 'step',
      name: 'Validate',
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1' },
    },
    {
      id: 'nap',
      type: 'sleep',
      name: 'Nap',
      version: '1.0.0',
      provider: 'cloudflare',
      data: { duration: '1 minute' },
    },
  ],
  edges: [{ id: 'e1', source: 'validate', target: 'nap' }],
  entryNodeId: 'validate',
  trigger: { type: 'http' },
}

describe('useWorkspaceData step sources', () => {
  it('shows every step node as a project-owned steps/<id>.ts holding its code', () => {
    const { result } = setup(undefined, { ir: STEP_IR })
    const step = result.current.baseline.get('steps/validate.ts')
    expect(step).toMatchObject({ source: 'return 1', role: 'source' })
    expect(step?.hash).toBeDefined()
    expect(result.current.baseline.has('steps/nap.ts')).toBe(false)
    expect([...result.current.stepPaths]).toEqual(['steps/validate.ts'])
    expect([...result.current.stepSourceByNode]).toEqual([['validate', 'steps/validate.ts']])
    expect(result.current.projectPaths.has('steps/validate.ts')).toBe(true)
    expect(result.current.storedPaths.has('steps/validate.ts')).toBe(false)
    expect(result.current.ownerOf('steps/validate.ts')).toBe('step')
    expect(result.current.editabilityOf('steps/validate.ts').readOnly).toBe(false)
    expect(result.current.trees.project.some((n) => n.path === 'steps')).toBe(true)
  })

  it('does not count step sources in the usage, nor in the stored files the poll compares', () => {
    const { result } = setup(undefined, { ir: STEP_IR })
    expect(result.current.usage.files).toBe(1)
    expect([...result.current.storedFiles.keys()]).toEqual(['workflow.ts'])
  })

  it('keeps the baseline empty until both the source and the workflow have loaded', () => {
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client, { ir: STEP_IR })
    client.removeQueries({ queryKey: ['workflow-full'] })
    const { result } = renderHook(() => useWorkspaceData(WORKFLOW_ID, undefined), {
      wrapper: workspaceWrapper(client),
    })
    expect(result.current.source).toBeDefined()
    expect(result.current.loaded).toBe(false)
    expect(result.current.baseline.size).toBe(0)
  })

  it('projects no step files from a version whose document cannot be read, and none without a version', () => {
    const legacy = setup(undefined, { ir: { nodes: 'not a list' } })
    expect(legacy.result.current.stepPaths.size).toBe(0)
    expect(legacy.result.current.loaded).toBe(true)
    const plain = setup()
    expect(plain.result.current.stepPaths.size).toBe(0)
    expect(plain.result.current.hasVersion).toBe(true)
  })

  it('reports a step whose path a stored file holds as a saved problem, and keeps the file', () => {
    const { result } = setup(undefined, {
      ir: STEP_IR,
      files: [
        { path: 'workflow.ts', source: 'export {}\n', role: 'entry', hash: 'h1' },
        { path: 'steps/validate.ts', source: 'old file', role: 'module', hash: 'h-old' },
      ],
    })
    expect(result.current.baseline.get('steps/validate.ts')?.source).toBe('old file')
    expect(result.current.ownerOf('steps/validate.ts')).toBe('project')
    expect(result.current.stepPaths.size).toBe(0)
    // The step map must not point the node at the person's file either, or
    // picking the step (or its compile finding) would open that file.
    expect(result.current.stepSourceByNode.has('validate')).toBe(false)
    expect(result.current.problemGroups.saved.map((s) => s.problem)).toEqual([
      expect.objectContaining({
        file: 'steps/validate.ts',
        severity: 'warning',
        message: expect.stringContaining('has no file here'),
      }),
    ])
    expect(result.current.problemCounts.warning).toBe(1)
  })

  it('a step draft whose node changed on the canvas reads as changed outside; a vanished node as a ghost', () => {
    const { result, rerender } = setup(undefined, { ir: STEP_IR })
    const hash = result.current.baseline.get('steps/validate.ts')!.hash!
    useIdeStore.getState().setDraft('steps/validate.ts', 'return 2', hash)
    rerender()
    expect([...result.current.dirty]).toEqual(['steps/validate.ts'])
    expect(result.current.ghostPaths).toEqual([])
    // The canvas removes the node: the draft stays, as a step-owned ghost.
    const client = createWorkspaceClient()
    seedWorkspaceQueries(client, { ir: { ...STEP_IR, nodes: [STEP_IR.nodes[1]], edges: [] } })
    const gone = renderHook(() => useWorkspaceData(WORKFLOW_ID, undefined), {
      wrapper: workspaceWrapper(client),
    })
    expect(gone.result.current.ghostPaths).toEqual(['steps/validate.ts'])
    expect(gone.result.current.ownerOf('steps/validate.ts')).toBe('step')
    expect(gone.result.current.files.get('steps/validate.ts')?.source).toBe('return 2')
  })
})
