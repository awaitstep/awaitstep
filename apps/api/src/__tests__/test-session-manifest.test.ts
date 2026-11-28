import { describe, expect, it } from 'vitest'
import { readSessionManifest, sessionManifest } from '../lib/test-session-manifest.js'

describe('a session’s stored manifest', () => {
  it('keeps the graph beside the files and gives both back apart', () => {
    const stored = JSON.stringify(sessionManifest([{ path: 'src/a.ts', hash: 'h1' }], 'g1'))
    expect(readSessionManifest(stored)).toEqual({ files: { 'src/a.ts': 'h1' }, graphHash: 'g1' })
  })

  it.each([
    ['nothing stored', null, { files: null, graphHash: null }],
    ['bad JSON', '{', { files: null, graphHash: null }],
    ['not an object', '[1]', { files: null, graphHash: null }],
    [
      'stored before the graph was kept',
      '{"src/a.ts":"h1"}',
      { files: { 'src/a.ts': 'h1' }, graphHash: null },
    ],
  ])('reads %s', (_name, stored, expected) => {
    expect(readSessionManifest(stored)).toEqual(expected)
  })
})
