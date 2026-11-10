import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useGeneratedEntry } from '../use-generated-entry'

vi.mock('../use-node-templates', () => ({
  useNodeTemplates: () => ({ getTemplate: () => undefined }),
}))

const step = {
  id: 'step-1',
  type: 'step',
  position: { x: 0, y: 0 },
  data: {
    irNode: {
      id: 'step-1',
      type: 'step',
      name: 'Fetch',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  },
}

function seed(kind: 'workflow' | 'script', nodes: unknown[] = [step]) {
  useWorkflowStore.setState({
    kind,
    metadata: { name: 'Preview', version: 1, createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    workflowEnvVars: [],
    runtimeResources: [],
    runtimeProvider: null,
  } as never)
}

beforeEach(() => {
  seed('workflow')
})

describe('useGeneratedEntry', () => {
  it('shows the portable workflow module by default', () => {
    const { result } = renderHook(() => useGeneratedEntry())
    expect(result.current.path).toBe('awaitstep/workflow.ts')
    expect(result.current.source).toContain('export default defineWorkflow')
    expect(result.current.source).not.toMatch(/cloudflare/i)
    expect(result.current.error).toBeNull()
  })

  it('shows the function module for a function, with its runGraph entry', () => {
    seed('script')
    const { result } = renderHook(() => useGeneratedEntry())
    expect(result.current.path).toBe('awaitstep/function.ts')
    expect(result.current.source).toContain('export async function runGraph')
    expect(result.current.error).toBeNull()
  })

  it('has nothing to show for a graph with no steps', () => {
    seed('workflow', [])
    const { result } = renderHook(() => useGeneratedEntry())
    expect(result.current).toEqual({ path: null, source: null, error: null })
  })
})
