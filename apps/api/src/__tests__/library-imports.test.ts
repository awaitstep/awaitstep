import { describe, expect, it } from 'vitest'
import { libraryImportProblems } from '../lib/library-imports.js'

describe('library import rules', () => {
  it('lets a module import npm packages, other modules and its own files', () => {
    const problems = libraryImportProblems('module', [
      {
        path: 'index.ts',
        source: `import { z } from 'zod'\nimport { fmt } from '#modules/fmt'\nimport { s } from './lib/score'`,
      },
      { path: 'lib/score.ts', source: `import data from '../data.json'\nexport const s = 1` },
    ])
    expect(problems).toEqual([])
  })

  it('refuses #app/ in library code, since it would reach into the consuming workflow', () => {
    const problems = libraryImportProblems('module', [
      { path: 'index.ts', source: `import cfg from '#app/config'` },
    ])
    expect(problems).toEqual([
      {
        path: 'index.ts',
        message: expect.stringContaining('"#app/config" reaches into the workflow'),
      },
    ])
  })

  it('refuses a module import that climbs out of its folder', () => {
    const problems = libraryImportProblems('module', [
      { path: 'lib/x.ts', source: `import y from '../../other/y'` },
    ])
    expect(problems).toEqual([
      { path: 'lib/x.ts', message: expect.stringContaining('reaches outside the module') },
    ])
  })

  it('lets a node template import its ctx types but no other relative file', () => {
    expect(
      libraryImportProblems('node', [
        {
          path: 'template.ts',
          source: `import type { Ctx } from './ctx'\nimport { a } from '#modules/a'`,
        },
      ]),
    ).toEqual([])
    expect(
      libraryImportProblems('node', [
        { path: 'template.ts', source: `import { helper } from './helpers'` },
      ]),
    ).toEqual([
      { path: 'template.ts', message: expect.stringContaining('"./helpers": a node template') },
    ])
  })

  it('judges a node template the way codegen hoists it: type-only imports pass, value ones from ./ctx do not', () => {
    expect(
      libraryImportProblems('node', [
        { path: 'template.ts', source: `import { type Ctx, type Output } from './ctx'` },
      ]),
    ).toEqual([])
    expect(
      libraryImportProblems('node', [
        { path: 'template.ts', source: `import { Ctx } from './ctx'` },
      ]),
    ).toEqual([
      { path: 'template.ts', message: expect.stringContaining('"./ctx": a node template') },
    ])
  })

  it('refuses a node template line carrying a second import, as codegen does', () => {
    expect(
      libraryImportProblems('node', [
        { path: 'template.ts', source: `import x from 'zod'; import y from './evil'` },
      ]),
    ).toEqual([{ path: 'template.ts', message: expect.stringContaining('one import per line') }])
  })

  it('says a module too tangled to check is too complex, not that it reaches outside', () => {
    expect(
      libraryImportProblems('module', [{ path: 'index.ts', source: 'import('.repeat(70_000) }]),
    ).toEqual([
      {
        path: 'index.ts',
        message: 'Imports too complex to check; simplify the comments or dynamic imports',
      },
    ])
  })

  it('ignores imports written in comments', () => {
    expect(
      libraryImportProblems('module', [{ path: 'index.ts', source: `// import x from '#app/x'` }]),
    ).toEqual([])
  })
})
