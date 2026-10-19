import { describe, it, expect } from 'vitest'
import type { ArtifactIR } from '@awaitstep/ir'
import { foldProjectFiles } from '../lib/runtime-fold.js'
import { snapshotFilesOf, toWorkflowFileRows } from '../lib/project-files.js'

const baseIr: ArtifactIR = {
  metadata: { name: 'T', version: 1, createdAt: '', updatedAt: '' },
  entryNodeId: 'n1',
  nodes: [
    {
      id: 'n1',
      type: 'step',
      name: 'n1',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
}

const live = [{ path: 'config/a.ts', source: 'live' }]
const withSnapshot: ArtifactIR = {
  ...baseIr,
  runtime: { triggerCode: 'tc', files: [{ path: 'config/a.ts', source: 'snapshot' }] },
}

describe('foldProjectFiles', () => {
  it('replaces the snapshot with the live table for the current version', () => {
    const folded = foldProjectFiles(withSnapshot, live, { useSnapshot: false })
    expect(folded.runtime).toEqual({ triggerCode: 'tc', files: live })
  })

  it('keeps the snapshot for historical versions', () => {
    expect(foldProjectFiles(withSnapshot, live, { useSnapshot: true })).toBe(withSnapshot)
  })

  it('drops a stale snapshot when the table is empty, removing an empty runtime', () => {
    const folded = foldProjectFiles(withSnapshot, [], { useSnapshot: false })
    expect(folded.runtime).toEqual({ triggerCode: 'tc' })
    const bare = foldProjectFiles({ ...baseIr, runtime: { files: live } }, [], {
      useSnapshot: false,
    })
    expect(bare).not.toHaveProperty('runtime')
  })

  it('copies only path and source from table rows', () => {
    const folded = foldProjectFiles(
      baseIr,
      [{ path: 'config/a.ts', source: 'x', hash: 'h', size: 1 } as never],
      { useSnapshot: false },
    )
    expect(folded.runtime?.files).toEqual([{ path: 'config/a.ts', source: 'x' }])
  })
})

describe('project file rows', () => {
  it('derives hash and byte size for table rows', () => {
    const [row] = toWorkflowFileRows('wf-1', [{ path: 'config/a.ts', source: 'é' }])
    expect(row).toMatchObject({ workflowId: 'wf-1', path: 'config/a.ts', source: 'é', size: 2 })
    expect(row.hash).toMatch(/^[0-9a-f]{16}$/)
    expect(row.id).toBeTruthy()
  })

  it('reads a stored version’s snapshot, tolerating old or malformed rows', () => {
    expect(snapshotFilesOf(JSON.stringify(withSnapshot))).toEqual(withSnapshot.runtime?.files)
    expect(snapshotFilesOf(JSON.stringify(baseIr))).toEqual([])
    expect(snapshotFilesOf('{"runtime":{"files":[{"path":1}]}}')).toEqual([])
    expect(snapshotFilesOf('not json')).toEqual([])
  })
})
