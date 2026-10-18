import { describe, expect, it } from 'vitest'
import {
  disposeWorkflowModels,
  syncWorkflowModels,
  workflowModels,
  type WorkflowModelLike,
} from '../monaco/models'
import { workflowModelPath } from '../monaco/setup'

class FakeModel implements WorkflowModelLike {
  disposed = false
  constructor(
    public readonly uriString: string,
    private value: string,
  ) {}
  uri = { toString: () => this.uriString }
  getValue() {
    return this.value
  }
  setValue(value: string) {
    this.value = value
  }
  dispose() {
    this.disposed = true
  }
  isDisposed() {
    return this.disposed
  }
}

function monacoWith(models: FakeModel[]) {
  return { editor: { getModels: () => models } }
}

describe('workflowModels', () => {
  it('returns only live models of the given workflow, with their bundle paths', () => {
    const mine = new FakeModel(workflowModelPath('wf-1', 'worker.ts'), 'a')
    const other = new FakeModel(workflowModelPath('wf-2', 'worker.ts'), 'b')
    const lib = new FakeModel('file:///awaitstep/cf-runtime.d.ts', 'c')
    const dead = new FakeModel(workflowModelPath('wf-1', 'old.ts'), 'd')
    dead.dispose()
    expect(workflowModels(monacoWith([mine, other, lib, dead]), 'wf-1')).toEqual([
      { model: mine, file: 'worker.ts' },
    ])
  })
})

describe('syncWorkflowModels', () => {
  it('replaces drifted text, leaves matching text alone and disposes vanished files', () => {
    const stale = new FakeModel(workflowModelPath('wf-1', 'worker.ts'), 'old entry')
    const same = new FakeModel(workflowModelPath('wf-1', 'src/nodes/a.ts'), 'same')
    const gone = new FakeModel(workflowModelPath('wf-1', 'src/nodes/removed.ts'), 'x')
    const foreign = new FakeModel(workflowModelPath('wf-2', 'worker.ts'), 'other')
    const files = new Map([
      ['worker.ts', { source: 'new entry' }],
      ['src/nodes/a.ts', { source: 'same' }],
    ])

    const result = syncWorkflowModels(monacoWith([stale, same, gone, foreign]), 'wf-1', files)

    expect(result).toEqual({ updated: ['worker.ts'], disposed: ['src/nodes/removed.ts'] })
    expect(stale.getValue()).toBe('new entry')
    expect(same.getValue()).toBe('same')
    expect(gone.disposed).toBe(true)
    expect(foreign.disposed).toBe(false)
    expect(foreign.getValue()).toBe('other')
  })
})

describe('disposeWorkflowModels', () => {
  it('disposes every model of the workflow and nothing else', () => {
    const a = new FakeModel(workflowModelPath('wf-1', 'worker.ts'), '')
    const b = new FakeModel(workflowModelPath('wf-1', 'src/nodes/a.ts'), '')
    const other = new FakeModel(workflowModelPath('wf-2', 'worker.ts'), '')
    expect(disposeWorkflowModels(monacoWith([a, b, other]), 'wf-1')).toEqual([
      'worker.ts',
      'src/nodes/a.ts',
    ])
    expect(a.disposed && b.disposed).toBe(true)
    expect(other.disposed).toBe(false)
  })
})
