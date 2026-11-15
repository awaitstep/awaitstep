import { describe, expect, it } from 'vitest'
import type { ArtifactIR, WorkflowIR } from '@awaitstep/ir'
import { generateUniversalWorkflowBundle } from '@awaitstep/codegen'
import {
  diffGenerated,
  withPendingGenerated,
  type BrowserBundle,
  type PendingGenerated,
} from '../ide/pending-generated'
import type { SourceFile } from '../api-client'

const step = (id: string, name: string) => ({
  id,
  type: 'step',
  name,
  version: '1.0.0',
  provider: 'cloudflare',
  position: { x: 0, y: 0 },
  data: { code: `export default async function ${name}() { return 1 }\n` },
})

const saved: ArtifactIR = {
  kind: 'workflow',
  irVersion: 3,
  metadata: { name: 'Orders', version: 1, createdAt: 't', updatedAt: 't' },
  nodes: [step('a', 'Fetch')],
  edges: [],
  entryNodeId: 'a',
}
const edited: ArtifactIR = {
  ...saved,
  nodes: [...saved.nodes, step('b', 'Hello')],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
}

function bundle(doc: ArtifactIR): BrowserBundle {
  const generated = generateUniversalWorkflowBundle(doc as WorkflowIR)
  return { files: generated.files, manifest: generated.manifest ?? null }
}

function pending(changed: [string, string][], removed: string[] = []): PendingGenerated {
  return { changed: new Map(changed), removed: new Set(removed), manifest: null }
}

describe('diffGenerated', () => {
  it('takes the generated workflow file and the manifest from the edited graph', () => {
    const diff = diffGenerated(bundle(saved), bundle(edited))
    const workflow = diff?.changed.get('awaitstep/workflow.ts')
    expect(workflow).toContain('$Hello(')
    expect(workflow).toContain('$Fetch(')
    expect(diff?.manifest?.steps.map((entry) => entry.nodeId)).toEqual(['a', 'b'])
  })

  it('lists the files the edits remove', () => {
    const diff = diffGenerated(bundle(edited), bundle(saved))
    expect(diff?.changed.get('awaitstep/workflow.ts')).not.toContain('$Hello(')
    expect([...(diff?.removed ?? [])]).toContain('steps/b.ts')
  })

  it('never takes env.ts from the browser: the server’s lists the resolved env names', () => {
    const before: BrowserBundle = {
      files: [{ path: 'awaitstep/env.ts', source: 'API_TOKEN' }],
      manifest: null,
    }
    const after: BrowserBundle = {
      files: [
        { path: 'awaitstep/env.ts', source: 'RESEND_API_KEY' },
        { path: 'awaitstep/workflow.ts', source: 'x' },
      ],
      manifest: null,
    }
    const diff = diffGenerated(before, after)
    expect([...(diff?.changed.keys() ?? [])]).toEqual(['awaitstep/workflow.ts'])
    expect(diffGenerated(after, { ...before, files: [] })?.removed.has('awaitstep/env.ts')).toBe(
      false,
    )
  })

  it('is null when nothing differs or either side could not be generated', () => {
    const same = bundle(saved)
    expect(diffGenerated(same, same)).toBeNull()
    expect(diffGenerated(same, bundle({ ...saved }))).toBeNull()
    expect(diffGenerated(same, null)).toBeNull()
    expect(diffGenerated(null, same)).toBeNull()
  })
})

describe('withPendingGenerated', () => {
  const files = new Map<string, SourceFile>([
    ['awaitstep/workflow.ts', { path: 'awaitstep/workflow.ts', source: 'server', role: 'entry' }],
    ['lib/a.ts', { path: 'lib/a.ts', source: 'mine', role: 'module', hash: 'h1' }],
    ['old.ts', { path: 'old.ts', source: 'gen', role: 'module' }],
    ['steps/b.ts', { path: 'steps/b.ts', source: 'bundle copy', role: 'module' }],
  ])

  it('lays new generated text over the server’s, keeping the role, and drops removed files', () => {
    const next = withPendingGenerated(
      files,
      pending(
        [
          ['awaitstep/workflow.ts', 'edited'],
          ['nodes/hello.ts', 'module'],
        ],
        ['old.ts'],
      ),
      new Set(['lib/a.ts']),
    )
    expect(next.get('awaitstep/workflow.ts')).toEqual({
      path: 'awaitstep/workflow.ts',
      source: 'edited',
      role: 'entry',
    })
    expect(next.get('nodes/hello.ts')?.source).toBe('module')
    expect(next.has('old.ts')).toBe(false)
  })

  it('drops the bundle copy of a removed step, but never writes a step path', () => {
    const next = withPendingGenerated(
      files,
      pending([['steps/c.ts', 'bundle copy']], ['steps/b.ts']),
      new Set(),
    )
    expect(next.has('steps/b.ts')).toBe(false)
    expect(next.has('steps/c.ts')).toBe(false)
  })

  it('never touches a project file', () => {
    const next = withPendingGenerated(
      files,
      pending([['lib/a.ts', 'generated over it']], ['lib/a.ts']),
      new Set(['lib/a.ts']),
    )
    expect(next.get('lib/a.ts')?.source).toBe('mine')
  })

  it('returns the same map with nothing pending', () => {
    expect(withPendingGenerated(files, null, new Set())).toBe(files)
  })
})
