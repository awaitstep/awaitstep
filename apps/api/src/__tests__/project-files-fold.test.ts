import { describe, it, expect } from 'vitest'
import type { ArtifactIR } from '@awaitstep/ir'
import {
  foldProjectFiles,
  foldProjectHandlers,
  legacyRuntimeSeeds,
  stripProjectOwnedRuntime,
} from '../lib/runtime-fold.js'
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

describe('foldProjectHandlers', () => {
  it('lets a project handlers.ts replace the folded trigger code', () => {
    const folded = foldProjectHandlers({
      ...baseIr,
      runtime: {
        triggerCode: 'legacy',
        files: [{ path: 'handlers.ts', source: '@fetch function handler() {}' }],
      },
    })
    expect(folded.runtime?.triggerCode).toBe('@fetch function handler() {}')
  })

  it('leaves the IR untouched without a handlers file', () => {
    expect(foldProjectHandlers(withSnapshot)).toBe(withSnapshot)
    expect(foldProjectHandlers(baseIr)).toBe(baseIr)
  })
})

describe('legacyRuntimeSeeds', () => {
  it('turns inline trigger code and dependencies into the files the project lacks', () => {
    const seeds = legacyRuntimeSeeds(
      { triggerCode: '@fetch function handler() {}', dependencies: { zod: '^4.0.0' } },
      ['config/env.ts'],
    )
    expect(seeds.map((s) => s.path)).toEqual(['handlers.ts', 'package.json'])
    expect(JSON.parse(seeds[1]!.source)).toEqual({ dependencies: { zod: '^4.0.0' } })
  })

  it('never re-seeds a file the project already has, and ignores empty settings', () => {
    expect(
      legacyRuntimeSeeds({ triggerCode: 'x', dependencies: { zod: '^4' } }, [
        'handlers.ts',
        'package.json',
      ]),
    ).toEqual([])
    // A converted project never gets the annotation file back.
    expect(legacyRuntimeSeeds({ triggerCode: 'x' }, ['handlers/fetch.ts'])).toEqual([])
    expect(legacyRuntimeSeeds({ triggerCode: '', dependencies: {} }, [])).toEqual([])
    expect(legacyRuntimeSeeds(undefined, [])).toEqual([])
  })
})

describe('stripProjectOwnedRuntime', () => {
  it('drops the inline copy of every setting a project file owns', () => {
    const ir = {
      ...baseIr,
      runtime: { triggerCode: 'stale', dependencies: { zod: '^4' }, env: [{ name: 'A' }] },
    }
    expect(stripProjectOwnedRuntime(ir, [{ path: 'handlers.ts', source: '' }]).runtime).toEqual({
      dependencies: { zod: '^4' },
      env: [{ name: 'A' }],
    })
    expect(
      stripProjectOwnedRuntime(ir, [
        { path: 'handlers.ts', source: '' },
        { path: 'package.json', source: '{}' },
      ]).runtime,
    ).toEqual({ env: [{ name: 'A' }] })
    expect(stripProjectOwnedRuntime(baseIr, [{ path: 'handlers.ts', source: '' }])).toBe(baseIr)
    // Handler modules own the trigger code just as the annotation file did.
    expect(
      stripProjectOwnedRuntime(ir, [{ path: 'handlers/queue/orders.ts', source: '' }]).runtime,
    ).toEqual({ dependencies: { zod: '^4' }, env: [{ name: 'A' }] })
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
