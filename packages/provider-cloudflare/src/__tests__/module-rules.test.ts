import { describe, it, expect } from 'vitest'
import { attachedModuleType } from '../deploy/module-rules.js'

describe('attachedModuleType', () => {
  it('types the files a no-bundle upload attaches by wrangler’s default rules', () => {
    expect(attachedModuleType('a.txt')).toBe('text')
    expect(attachedModuleType('page.html')).toBe('text')
    expect(attachedModuleType('q.sql')).toBe('text')
    expect(attachedModuleType('blob.bin')).toBe('data')
    expect(attachedModuleType('dir/engine.wasm')).toBe('compiled-wasm')
  })

  it('leaves out what the upload leaves out', () => {
    for (const name of [
      'README.md',
      'worker.js.map',
      'data.json',
      'chunk.js',
      'noext',
      'dir.txt/file',
    ]) {
      expect(attachedModuleType(name), name).toBeNull()
    }
  })

  it('matches extensions case-sensitively, as wrangler’s globs do', () => {
    expect(attachedModuleType('NOTES.TXT')).toBeNull()
  })
})
