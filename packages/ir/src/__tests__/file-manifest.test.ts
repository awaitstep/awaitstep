import { describe, expect, it } from 'vitest'
import { buildFileManifest, compareFileManifest } from '../file-manifest.js'

describe('compareFileManifest', () => {
  const session = { 'a.ts': 'h1', 'b.ts': 'h2', 'c.ts': 'h3' }

  it('reports nothing when the files are unchanged', () => {
    expect(compareFileManifest(session, { ...session })).toEqual({
      saved: [],
      deleted: [],
      added: [],
    })
  })

  it('reports a path with a different hash as saved', () => {
    expect(compareFileManifest(session, { ...session, 'b.ts': 'new' }).saved).toEqual(['b.ts'])
  })

  it('reports a path missing now as deleted', () => {
    const { 'c.ts': _gone, ...rest } = session
    expect(compareFileManifest(session, rest).deleted).toEqual(['c.ts'])
  })

  it('reports a new path as added', () => {
    expect(compareFileManifest(session, { ...session, 'd.ts': 'h4' }).added).toEqual(['d.ts'])
  })

  it('reports saved, deleted and added together', () => {
    expect(compareFileManifest(session, { 'a.ts': 'h1', 'b.ts': 'x', 'd.ts': 'h4' })).toEqual({
      saved: ['b.ts'],
      deleted: ['c.ts'],
      added: ['d.ts'],
    })
  })

  it('treats a missing session manifest as unknown', () => {
    const empty = { saved: [], deleted: [], added: [] }
    expect(compareFileManifest(null, { 'a.ts': 'h1' })).toEqual(empty)
    expect(compareFileManifest(undefined, { 'a.ts': 'h1' })).toEqual(empty)
  })

  it('is not fooled by prototype property names', () => {
    expect(compareFileManifest({ a: 'h' }, { a: 'h' })).toEqual({
      saved: [],
      deleted: [],
      added: [],
    })
    expect(compareFileManifest({ toString: 'h' }, {}).deleted).toEqual(['toString'])
  })
})

describe('buildFileManifest', () => {
  it('maps path to hash', () => {
    expect(
      buildFileManifest([
        { path: 'a.ts', hash: 'h1' },
        { path: 'b.ts', hash: 'h2' },
      ]),
    ).toEqual({ 'a.ts': 'h1', 'b.ts': 'h2' })
  })

  it('keeps at most the limit', () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ path: `f${i}.ts`, hash: `h${i}` }))
    expect(Object.keys(buildFileManifest(rows))).toHaveLength(100)
  })
})

describe('buildFileManifest with prototype-named paths', () => {
  it('records a path called __proto__ as an entry, not as a prototype change', () => {
    const manifest = buildFileManifest([{ path: '__proto__', hash: 'h1' }])
    expect(Object.keys(manifest)).toEqual(['__proto__'])
    expect(Object.getPrototypeOf(manifest)).toBeNull()
  })
})
