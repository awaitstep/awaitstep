import { describe, expect, it } from 'vitest'
import {
  basename,
  buildFileTree,
  dirname,
  fileLanguage,
  normalizeBundlePath,
} from '../ide/file-tree'

const files = [
  { path: 'worker.ts', role: 'entry' as const },
  { path: 'src/nodes/fetch_data.ts', role: 'module' as const },
  { path: 'src/nodes/Alpha.ts', role: 'module' as const },
  { path: 'src/helpers.ts', role: 'module' as const },
  { path: 'wrangler.json', role: 'config' as const },
  { path: 'package.json', role: 'meta' as const },
]

describe('buildFileTree', () => {
  it('nests directories before files and sorts each level case-insensitively', () => {
    const tree = buildFileTree(files)
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual([
      'dir:src',
      'file:package.json',
      'file:worker.ts',
      'file:wrangler.json',
    ])
    const src = tree[0]
    if (src.kind !== 'dir') throw new Error('expected dir')
    expect(src.children.map((n) => n.name)).toEqual(['nodes', 'helpers.ts'])
    const nodes = src.children[0]
    if (nodes.kind !== 'dir') throw new Error('expected dir')
    expect(nodes.children.map((n) => n.name)).toEqual(['Alpha.ts', 'fetch_data.ts'])
    expect(nodes.path).toBe('src/nodes')
  })

  it('keeps file roles and full paths on leaves', () => {
    const tree = buildFileTree(files)
    const worker = tree.find((n) => n.name === 'worker.ts')
    expect(worker).toMatchObject({ kind: 'file', path: 'worker.ts', role: 'entry' })
  })

  it('normalizes relative prefixes and collapses duplicate paths', () => {
    const tree = buildFileTree([
      { path: './src//a.ts', role: 'module' },
      { path: 'src/a.ts', role: 'entry' },
      { path: '', role: 'meta' },
    ])
    expect(tree).toHaveLength(1)
    const src = tree[0]
    if (src.kind !== 'dir') throw new Error('expected dir')
    expect(src.children).toEqual([{ kind: 'file', name: 'a.ts', path: 'src/a.ts', role: 'entry' }])
  })

  it('returns an empty tree for no files', () => {
    expect(buildFileTree([])).toEqual([])
  })
})

describe('path helpers', () => {
  it('splits basename and dirname', () => {
    expect(basename('src/nodes/a.ts')).toBe('a.ts')
    expect(basename('worker.ts')).toBe('worker.ts')
    expect(dirname('src/nodes/a.ts')).toBe('src/nodes')
    expect(dirname('worker.ts')).toBe('')
  })

  it('normalizes bundle paths', () => {
    expect(normalizeBundlePath('./a/./b.ts')).toBe('a/b.ts')
    expect(normalizeBundlePath('/a//b.ts')).toBe('a/b.ts')
  })
})

describe('fileLanguage', () => {
  it('maps code, config and doc extensions to Monaco language ids', () => {
    expect(fileLanguage('worker.ts')).toBe('typescript')
    expect(fileLanguage('src/x.mjs')).toBe('javascript')
    expect(fileLanguage('wrangler.json')).toBe('json')
    expect(fileLanguage('README.md')).toBe('markdown')
    expect(fileLanguage('wrangler.toml')).toBe('ini')
  })

  it('falls back to plaintext for unknown or missing extensions', () => {
    expect(fileLanguage('LICENSE')).toBe('plaintext')
    expect(fileLanguage('.env')).toBe('plaintext')
    expect(fileLanguage('notes.weird')).toBe('plaintext')
  })
})
