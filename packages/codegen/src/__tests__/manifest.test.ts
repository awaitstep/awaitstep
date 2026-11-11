import { describe, it, expect } from 'vitest'
import { contentHash as irContentHash } from '@awaitstep/ir'
import { contentHash, resolveStepNode, stepLabelBase } from '../manifest.js'

describe('contentHash', () => {
  it('is the ir package’s hash, re-exported for the importers that found it here', () => {
    expect(contentHash).toBe(irContentHash)
  })
})

describe('resolveStepNode', () => {
  const manifest = {
    irHash: 'x',
    steps: [
      { nodeId: 'fetch', stepName: 'fetch', kind: 'do' as const, varName: 'Fetch_data' },
      { nodeId: 'nap', stepName: 'nap', kind: 'sleep' as const, varName: 'Nap' },
      { nodeId: 'sub-1', varName: 'Run_child' },
    ],
  }

  it('maps an exact label to its node', () => {
    expect(resolveStepNode(manifest, 'fetch')).toBe('fetch')
    expect(resolveStepNode(manifest, 'nap')).toBe('nap')
  })

  it('strips loop iteration suffixes before matching', () => {
    expect(resolveStepNode(manifest, 'fetch [3]')).toBe('fetch')
  })

  it('maps derived multi-step labels back through the node id', () => {
    expect(resolveStepNode(manifest, 'sub-1--create')).toBe('sub-1')
    expect(resolveStepNode(manifest, 'sub-1--await')).toBe('sub-1')
  })

  it('drops the occurrence count Cloudflare appends to each step name', () => {
    // As Cloudflare reports them: `<name>-<n>`, and after a loop suffix.
    expect(resolveStepNode(manifest, 'fetch-1')).toBe('fetch')
    expect(resolveStepNode(manifest, 'nap-2')).toBe('nap')
    expect(resolveStepNode(manifest, 'fetch [3]-1')).toBe('fetch')
    expect(resolveStepNode(manifest, 'sub-1--create-1')).toBe('sub-1')
  })

  it('finds an entry with no step name of its own by its node id (a wait)', () => {
    const withWait = {
      ...manifest,
      steps: [...manifest.steps, { nodeId: 'ivtiftpd9fa_', varName: 'wait_for_sunny' }],
    }
    expect(resolveStepNode(withWait, 'ivtiftpd9fa_-1')).toBe('ivtiftpd9fa_')
    expect(resolveStepNode(withWait, 'ivtiftpd9fa_')).toBe('ivtiftpd9fa_')
  })

  it('keeps a node id that itself ends in -<digits>', () => {
    expect(resolveStepNode(manifest, 'sub-1')).toBe('sub-1')
    expect(stepLabelBase('fetch-1')).toBe('fetch')
  })

  it('returns undefined for labels the manifest cannot claim', () => {
    expect(resolveStepNode(manifest, 'unknown-step')).toBeUndefined()
  })
})
