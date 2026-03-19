// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveWorkflowLocally,
  loadWorkflowLocally,
  removeWorkflowLocally,
  listLocalWorkflowIds,
  type PersistedWorkflow,
} from '../local-persistence'

const mockWorkflow: PersistedWorkflow = {
  metadata: {
    name: 'Test Workflow',
    version: 1,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  nodes: [
    {
      id: 'n1',
      type: 'step',
      position: { x: 0, y: 0 },
      data: {
        irNode: {
          id: 'n1',
          type: 'step',
          name: 'Test',
          position: { x: 0, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { code: 'return 1' },
        },
      },
    },
  ],
  edges: [],
  inputParams: [],
  envBindings: [],
  savedAt: '2025-01-01T00:00:00Z',
}

beforeEach(() => {
  localStorage.clear()
})

describe('saveWorkflowLocally / loadWorkflowLocally', () => {
  it('round-trips a workflow', () => {
    saveWorkflowLocally('test-id', mockWorkflow)
    const loaded = loadWorkflowLocally('test-id')
    expect(loaded).toEqual(mockWorkflow)
  })

  it('returns null for nonexistent workflow', () => {
    expect(loadWorkflowLocally('missing')).toBeNull()
  })

  it('returns null for corrupt data', () => {
    localStorage.setItem('awaitstep-wf-bad', 'not-json')
    expect(loadWorkflowLocally('bad')).toBeNull()
  })

  it('returns null for valid JSON but wrong shape', () => {
    localStorage.setItem('awaitstep-wf-bad2', '{"foo": 1}')
    expect(loadWorkflowLocally('bad2')).toBeNull()
  })
})

describe('removeWorkflowLocally', () => {
  it('removes a saved workflow', () => {
    saveWorkflowLocally('rm-test', mockWorkflow)
    removeWorkflowLocally('rm-test')
    expect(loadWorkflowLocally('rm-test')).toBeNull()
  })
})

describe('listLocalWorkflowIds', () => {
  it('lists saved workflow IDs', () => {
    saveWorkflowLocally('id1', mockWorkflow)
    saveWorkflowLocally('id2', mockWorkflow)
    localStorage.setItem('other-key', 'value')
    const ids = listLocalWorkflowIds()
    expect(ids).toContain('id1')
    expect(ids).toContain('id2')
    expect(ids).not.toContain('other-key')
  })

  it('returns empty for no workflows', () => {
    expect(listLocalWorkflowIds()).toEqual([])
  })
})
