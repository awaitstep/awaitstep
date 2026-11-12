import { describe, expect, it } from 'vitest'
import type { ApiLibraryTree } from '../../library-api'
import { buildIdeIndex } from '../ide-index'
import { importedModuleSlugs, reachedItems } from '../reach'

function tree(): ApiLibraryTree {
  const file = (path: string, readOnly = false) => ({
    path,
    hash: `h-${path}`,
    readOnly,
  })
  const item = (id: string, kind: 'module' | 'node', files: string[]) => ({
    id,
    kind,
    slug: id,
    name: id,
    latestVersion: null,
    files: files.map((f) => file(f)),
  })
  return {
    owner: { kind: 'workspace', id: 'ws' },
    viewerCan: { edit: { allowed: true }, create: { allowed: true } },
    projectModules: [],
    items: [
      item('post', 'node', ['1.0.0/template.ts', '1.0.0/node.json']),
      item('fmt', 'module', ['index.ts', 'package.json']),
      item('dates', 'module', ['index.ts']),
      item('unused', 'module', ['index.ts']),
    ],
  }
}

function loaded(entries: Record<string, string>) {
  return new Map(Object.entries(entries).map(([path, source]) => [path, { path, source }]))
}

describe('reachedItems', () => {
  it('follows #modules imports from the wanted items through the modules they reach', () => {
    const index = buildIdeIndex(tree())
    const files = loaded({
      'nodes/post/1.0.0/template.ts': "import { f } from '#modules/fmt'",
      'modules/fmt/index.ts': "import { d } from '#modules/dates'\nimport '#modules/elsewhere'",
      'modules/unused/index.ts': "import '#modules/dates'",
    })
    expect([...reachedItems(index, new Set(['post']), files, {})].sort()).toEqual([
      'dates',
      'fmt',
      'post',
    ])
    expect(importedModuleSlugs(index, files, {})).toEqual({
      own: ['dates', 'fmt'],
      foreign: ['elsewhere'],
    })
  })

  it('reads an import from unsaved text, and ignores ids no longer in the tree', () => {
    const index = buildIdeIndex(tree())
    const files = loaded({ 'modules/fmt/index.ts': 'export {}' })
    const drafts = { 'modules/fmt/index.ts': { source: "import '#modules/dates'", baseHash: 'h' } }
    expect([...reachedItems(index, new Set(['fmt', 'gone']), files, drafts)].sort()).toEqual([
      'dates',
      'fmt',
    ])
  })
})
