import { describe, expect, it } from 'vitest'
import type { ArtifactIR } from '@awaitstep/ir'
import type { DatabaseAdapter } from '@awaitstep/db'
import { foldLibrary } from '../lib/library-fold.js'

const ir = {
  metadata: { name: 't', version: 1, createdAt: '', updatedAt: '' },
  nodes: [
    {
      id: 's',
      type: 'step',
      name: 'S',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: "import { a } from '#modules/a'\nreturn a" },
    },
  ],
  edges: [],
  entryNodeId: 's',
} as unknown as ArtifactIR

describe('folding the Library', () => {
  it('says only that the closure ran over the cap, since which items were cut is arbitrary', async () => {
    const db = {
      resolveLibraryBundle: async () => ({ items: [], truncated: true, oversize: false }),
    } as unknown as DatabaseAdapter
    const fold = await foldLibrary(db, { projectId: 'p', workspaceId: 'w' }, ir)
    expect(fold.diagnostics.map((d) => d.message)).toEqual([
      'This workflow reaches more than 100 library items',
    ])
    expect(fold.ir).toBe(ir)
  })

  it('folds nothing and says why when the library code it reaches is over the size limit', async () => {
    const db = {
      resolveLibraryBundle: async () => ({ items: [], truncated: false, oversize: true }),
    } as unknown as DatabaseAdapter
    const fold = await foldLibrary(db, { projectId: 'p', workspaceId: 'w' }, ir)
    expect(fold.diagnostics.map((d) => d.message)).toEqual([
      'The library code this workflow reaches is over 400 files or 4000000 bytes',
    ])
    expect(fold.paths).toEqual([])
  })

  it('asks the database nothing for a workflow that uses no library code', async () => {
    const db = {
      resolveLibraryBundle: () => {
        throw new Error('not expected')
      },
    } as unknown as DatabaseAdapter
    const plain = { ...ir, nodes: [{ ...ir.nodes[0]!, data: { code: 'return 1' } }] } as ArtifactIR
    expect(
      (await foldLibrary(db, { projectId: 'p', workspaceId: 'w' }, plain)).diagnostics,
    ).toEqual([])
  })
})
