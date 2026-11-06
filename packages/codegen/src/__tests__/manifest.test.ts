import { describe, it, expect } from 'vitest'
import { contentHash as irContentHash } from '@awaitstep/ir'
import { contentHash, resolveStepNode } from '../manifest.js'

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

  it('returns undefined for labels the manifest cannot claim', () => {
    expect(resolveStepNode(manifest, 'unknown-step')).toBeUndefined()
  })
})
