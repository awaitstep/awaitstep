import { describe, expect, it } from 'vitest'
import type { SourceDiagnostic, SourceFile } from '../../api-client'
import type { Drafts } from '../drafts'
import {
  canvasLibraryRoots,
  canvasSavedCode,
  libraryRoots,
  slugsToResolve,
  withEditorLibrary,
  withEditorLibraryDiagnostics,
} from '../unsaved-library'

const file = (path: string, source: string): SourceFile => ({ path, source, role: 'module' })
const saved = (entries: Record<string, string>) =>
  new Map(Object.entries(entries).map(([path, source]) => [path, file(path, source)]))
const drafts = (entries: Record<string, string>): Drafts =>
  Object.fromEntries(
    Object.entries(entries).map(([path, source]) => [path, { source, baseHash: null }]),
  )

describe('libraryRoots', () => {
  it('reads the imports of the workflow’s own code, as saved and with the drafts over it', () => {
    const roots = libraryRoots(
      saved({ 'steps/a.ts': "import '#modules/fmt'", 'lib/b.ts': "import '#modules/log'" }),
      drafts({ 'steps/a.ts': "import '#modules/solo'", 'lib/new.ts': "import '#modules/fmt'" }),
      ['steps/a.ts', 'lib/b.ts'],
    )
    expect(roots).toEqual({ saved: ['fmt', 'log'], edited: ['fmt', 'log', 'solo'] })
  })

  it('ignores what a deploy ignores: docs, JSON, Library files and files that are not the workflow’s', () => {
    const roots = libraryRoots(
      saved({
        'modules/fmt/index.ts': "import '#modules/inner'",
        'awaitstep/workflow.ts': "import '#modules/generated'",
      }),
      drafts({ 'README.md': 'use `#modules/foo`', 'data/x.json': '{"a":"#modules/bar"}' }),
      ['modules/fmt/index.ts'],
    )
    expect(roots).toEqual({ saved: [], edited: [] })
  })
})

describe('slugsToResolve', () => {
  it('asks for every edited import once one is new, and nothing while none is', () => {
    expect(slugsToResolve({ saved: ['fmt'], edited: ['fmt', 'solo'] })).toEqual(['fmt', 'solo'])
    expect(slugsToResolve({ saved: ['fmt', 'solo'], edited: ['fmt'] })).toEqual([])
    expect(slugsToResolve({ saved: [], edited: [] })).toEqual([])
  })

  it('asks for nothing past what one bundle may name', () => {
    const many = Array.from({ length: 101 }, (_, i) => `m${i}`)
    expect(slugsToResolve({ saved: [], edited: many })).toEqual([])
  })
})

describe('withEditorLibrary', () => {
  it('swaps the saved bundle’s module folders for the answer’s, keeping everything else', () => {
    const files = saved({
      'steps/a.ts': 'a',
      'modules/fmt/index.ts': 'workspace fmt',
      'modules/fmt/extra.ts': 'workspace fmt extra',
    })
    const result = withEditorLibrary(
      files,
      [{ slug: 'fmt' }],
      { files: [file('modules/solo/index.ts', 'solo')] },
      new Set(['steps/a.ts']),
    )
    expect([...result.keys()]).toEqual(['steps/a.ts', 'modules/solo/index.ts'])
  })

  it('never shows Library code in place of the workflow’s own file under modules/', () => {
    const files = saved({ 'modules/solo/index.ts': 'mine' })
    const result = withEditorLibrary(
      files,
      [],
      { files: [file('modules/solo/index.ts', 'library')] },
      new Set(['modules/solo/index.ts']),
    )
    expect(result.get('modules/solo/index.ts')?.source).toBe('mine')
  })
})

describe('withEditorLibraryDiagnostics', () => {
  const unpublished: SourceDiagnostic = {
    source: 'library',
    message: 'Module "x" has no published version yet; publish it to use it',
  }
  const onNode: SourceDiagnostic = {
    source: 'library',
    message: 'Unknown custom node',
    nodeId: 'n',
  }
  const compile: SourceDiagnostic = { source: 'compile', message: 'bad', path: 'steps/a.ts' }

  it('keeps the source’s findings while there is no answer', () => {
    expect(withEditorLibraryDiagnostics([unpublished, compile], null)).toEqual([
      unpublished,
      compile,
    ])
  })

  it('replaces the saved module findings with the answer’s, so none is listed twice', () => {
    expect(
      withEditorLibraryDiagnostics([unpublished, onNode, compile], { diagnostics: [unpublished] }),
    ).toEqual([onNode, compile, unpublished])
  })
})

describe('canvasLibraryRoots', () => {
  it('reads saved imports from the bundle’s code and edited ones from stored files and the canvas’s node code', () => {
    const saved = canvasSavedCode([
      { path: 'lib/x.ts', source: "import '#modules/fmt'", hash: 'h' },
      { path: 'steps/s1.ts', source: "import '#modules/log'" },
      { path: 'modules/fmt/index.ts', source: "import '#modules/inner'" },
    ])
    expect(canvasLibraryRoots(saved, ["import '#modules/solo'"])).toEqual({
      saved: ['fmt', 'log'],
      edited: ['fmt', 'solo'],
    })
  })
})
