import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ArtifactIR } from '@awaitstep/ir'
import { usePendingGenerated, type PendingGeneratedInput } from '../use-pending-generated'

// The real hook memoises its resolver: one object for as long as the templates hold.
const resolver = vi.hoisted(() => ({ getTemplate: () => undefined, getRuntime: () => undefined }))
vi.mock('../use-node-templates', () => ({ useNodeTemplates: () => resolver }))

const node = (id: string, name: string, type = 'step') => ({
  id,
  type,
  name,
  version: '1.0.0',
  provider: 'cloudflare',
  position: { x: 0, y: 0 },
  data: type === 'step' ? { code: `export default async function ${name}() { return 1 }\n` } : {},
})

const saved: ArtifactIR = {
  irVersion: 3,
  metadata: { name: 'Orders', version: 1, createdAt: 't', updatedAt: 't' },
  nodes: [node('a', 'Fetch')],
  edges: [],
  entryNodeId: 'a',
} as ArtifactIR
const edited: ArtifactIR = {
  ...saved,
  nodes: [...saved.nodes, node('b', 'Hello')],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
}
// A custom node whose template hasn't loaded: generation throws.
const unloaded: ArtifactIR = {
  ...edited,
  nodes: [...edited.nodes, node('c', 'Lead', 'custom:lead')],
  edges: [...edited.edges, { id: 'e2', source: 'b', target: 'c' }],
}

function setup(initial: PendingGeneratedInput) {
  return renderHook((input: PendingGeneratedInput) => usePendingGenerated(input), {
    initialProps: initial,
  })
}

const base = { kind: 'workflow' as const, sourceLagging: false }

describe('usePendingGenerated', () => {
  it('is null with no pending edits, and on an older version', () => {
    expect(setup({ ...base, saved, edited: saved }).result.current).toBeNull()
    expect(setup({ ...base, saved: null, edited: null }).result.current).toBeNull()
  })

  it('keeps the last overlay while a new node’s template is still loading', () => {
    const { result, rerender } = setup({ ...base, saved, edited })
    const first = result.current
    expect(first?.changed.get('awaitstep/workflow.ts')).toContain('$Hello(')
    rerender({ ...base, saved, edited: unloaded })
    expect(result.current).toBe(first)
  })

  it('keeps the last overlay after a save while the generated files catch up, then lets go', () => {
    const { result, rerender } = setup({ ...base, saved, edited })
    const first = result.current
    // The save landed: the version is the edited one, the files are not yet.
    rerender({ ...base, saved: edited, edited, sourceLagging: true })
    expect(result.current).toBe(first)
    rerender({ ...base, saved: edited, edited, sourceLagging: false })
    expect(result.current).toBeNull()
  })

  it('generates a function whose stored document carries no kind as a function', () => {
    const { result } = setup({ saved, edited, kind: 'script', sourceLagging: false })
    const paths = [...(result.current?.changed.keys() ?? [])]
    expect(paths).toContain('awaitstep/function.ts')
    expect(paths).not.toContain('awaitstep/workflow.ts')
  })
})
