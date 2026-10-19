import { describe, expect, it, vi } from 'vitest'
import {
  disposeWorkflowModels,
  syncWorkflowModels,
  workflowModels,
  type MonacoModelsLike,
  type WorkflowModelLike,
} from '../monaco/models'
import { workflowModelPath } from '../monaco/setup'

class FakeModel implements WorkflowModelLike {
  disposed = false
  constructor(
    public readonly uriString: string,
    private value: string,
    public readonly language = 'typescript',
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

/** A Monaco stand-in whose model list grows as models are created. */
function monacoWith(models: FakeModel[]): MonacoModelsLike & { models: FakeModel[] } {
  const live = [...models]
  return {
    models: live,
    editor: {
      getModels: () => live,
      createModel(value, language, uri) {
        const model = new FakeModel(String(uri), value, language)
        live.push(model)
        return model
      },
    },
    Uri: { parse: (value: string) => value },
  }
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
  it('creates missing models, replaces drifted text, leaves matching text alone and disposes vanished files', () => {
    const stale = new FakeModel(workflowModelPath('wf-1', 'worker.ts'), 'old entry')
    const same = new FakeModel(workflowModelPath('wf-1', 'src/nodes/a.ts'), 'same')
    const gone = new FakeModel(workflowModelPath('wf-1', 'src/nodes/removed.ts'), 'x')
    const foreign = new FakeModel(workflowModelPath('wf-2', 'worker.ts'), 'other')
    const monaco = monacoWith([stale, same, gone, foreign])
    const files = new Map([
      ['worker.ts', { source: 'new entry' }],
      ['src/nodes/a.ts', { source: 'same' }],
      ['config/env.ts', { source: 'export const region = "eu"' }],
      ['data/countries.json', { source: '[]' }],
    ])

    const result = syncWorkflowModels(monaco, 'wf-1', files)

    expect(result).toEqual({
      created: ['config/env.ts', 'data/countries.json'],
      updated: ['worker.ts'],
      disposed: ['src/nodes/removed.ts'],
    })
    expect(stale.getValue()).toBe('new entry')
    expect(same.getValue()).toBe('same')
    expect(gone.disposed).toBe(true)
    expect(foreign.disposed).toBe(false)
    expect(foreign.getValue()).toBe('other')
    // New models get the workflow URI and a language by extension, so the
    // TypeScript worker (eager model sync) sees the whole project.
    const env = monaco.models.find(
      (m) => m.uriString === workflowModelPath('wf-1', 'config/env.ts'),
    )
    expect(env).toMatchObject({ language: 'typescript' })
    expect(env?.getValue()).toBe('export const region = "eu"')
    expect(
      monaco.models.find((m) => m.uriString === workflowModelPath('wf-1', 'data/countries.json')),
    ).toMatchObject({ language: 'json' })
  })

  it('skips models whose file object has not changed since the last sync', () => {
    const model = new FakeModel(workflowModelPath('wf-1', 'worker.ts'), 'typed')
    const file = { source: 'typed' }
    const files = new Map([['worker.ts', file]])
    const monaco = monacoWith([model])
    syncWorkflowModels(monaco, 'wf-1', files)

    // Monaco already holds what the user typed; the same file object means
    // nothing to compare — the model's text is not even read.
    const reads = vi.spyOn(model, 'getValue')
    expect(syncWorkflowModels(monaco, 'wf-1', files).updated).toEqual([])
    expect(reads).not.toHaveBeenCalled()

    // A new file object (the baseline refetched) is compared again.
    const refreshed = new Map([['worker.ts', { source: 'from server' }]])
    expect(syncWorkflowModels(monaco, 'wf-1', refreshed).updated).toEqual(['worker.ts'])
    expect(model.getValue()).toBe('from server')
  })

  it('does not re-create a model it just created', () => {
    const monaco = monacoWith([])
    const files = new Map([['a.ts', { source: 'a' }]])
    expect(syncWorkflowModels(monaco, 'wf-1', files).created).toEqual(['a.ts'])
    expect(syncWorkflowModels(monaco, 'wf-1', files)).toEqual({
      created: [],
      updated: [],
      disposed: [],
    })
    expect(monaco.models).toHaveLength(1)
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
