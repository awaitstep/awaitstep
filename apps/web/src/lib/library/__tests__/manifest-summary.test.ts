import { describe, expect, it } from 'vitest'
import type { ApiLibraryTreeItem } from '../../library-api'
import { manifestSummary } from '../manifest-summary'

function item(over: Partial<ApiLibraryTreeItem>): ApiLibraryTreeItem {
  return {
    id: 'i',
    kind: 'module',
    slug: 'lead-scoring',
    name: 'Lead scoring',
    latestVersion: null,
    files: [],
    ...over,
  } as ApiLibraryTreeItem
}

describe('the Details manifest card', () => {
  it('lists a module’s package.json keys as the file names them, then its import path', () => {
    const source = JSON.stringify({ name: 'lead-scoring', description: 'Scores', version: '1.4.3' })
    const summary = manifestSummary(item({}), () => source)
    expect(summary?.rows).toEqual([
      { label: 'name', value: 'lead-scoring' },
      { label: 'description', value: 'Scores' },
      { label: 'version', value: '1.4.3' },
      { label: 'import', value: '#modules/lead-scoring' },
    ])
  })

  it('leaves out a description the file does not have', () => {
    const summary = manifestSummary(item({}), () => JSON.stringify({ name: 'x', version: '1.0.0' }))
    expect(summary?.rows.map((row) => row.label)).toEqual(['name', 'version', 'import'])
  })

  it('reads a node’s newest folder’s node.json', () => {
    const node = item({
      kind: 'node',
      slug: 'post',
      files: [
        { path: '1.0.0/node.json', hash: 'a', readOnly: true },
        { path: '1.0.1/node.json', hash: 'b', readOnly: false },
      ],
    } as Partial<ApiLibraryTreeItem>)
    const sources: Record<string, string> = {
      'nodes/post/1.0.1/node.json': JSON.stringify({
        id: 'post',
        name: 'Post',
        category: 'Messaging',
        version: '1.0.1',
      }),
    }
    const summary = manifestSummary(node, (path) => sources[path])
    expect(summary?.path).toBe('nodes/post/1.0.1/node.json')
    expect(summary?.rows).toEqual([
      { label: 'id', value: 'post' },
      { label: 'name', value: 'Post' },
      { label: 'category', value: 'Messaging' },
      { label: 'version', value: '1.0.1' },
    ])
  })
})
