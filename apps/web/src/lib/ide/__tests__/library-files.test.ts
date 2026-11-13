import { describe, expect, it } from 'vitest'
import { fileOwner, libraryFilesOf, splitWorkspaceFiles } from '../project'
import { fileEditability, LIBRARY_FILE_MESSAGE } from '../editability'

const SCORING = {
  itemId: 'i1',
  slug: 'lead-scoring',

  owner: 'workspace' as const,
  version: '1.4.2',
}

describe('Library files in a workflow bundle', () => {
  it('finds the files of the modules the source lists, and nothing else under modules/', () => {
    const byPath = libraryFilesOf(
      [
        'modules/lead-scoring/index.ts',
        'modules/lead-scoring/score.ts',
        'modules/other/x.ts',
        'lib/a.ts',
      ],
      [SCORING],
    )
    expect([...byPath.keys()]).toEqual([
      'modules/lead-scoring/index.ts',
      'modules/lead-scoring/score.ts',
    ])
    expect(byPath.get('modules/lead-scoring/score.ts')).toBe(SCORING)
  })

  it('finds none when the source lists no modules', () => {
    expect(libraryFilesOf(['modules/lead-scoring/index.ts'], []).size).toBe(0)
  })

  it('owns them as library, beside project and generated files', () => {
    const sets = {
      projectPaths: new Set(['lib/a.ts']),
      storedPaths: new Set(['lib/a.ts']),
      libraryPaths: new Set(['modules/lead-scoring/index.ts']),
    }
    expect(fileOwner('modules/lead-scoring/index.ts', sets)).toBe('library')
    expect(fileOwner('lib/a.ts', sets)).toBe('project')
    expect(fileOwner('worker.ts', sets)).toBe('generated')
  })

  it('splits them into their own group', () => {
    const files = [
      { path: 'lib/a.ts', source: '', role: 'module' },
      { path: 'modules/lead-scoring/index.ts', source: '', role: 'module' },
      { path: 'worker.ts', source: '', role: 'entry' },
    ] as const
    const split = splitWorkspaceFiles(
      files.map((f) => ({ ...f })),
      new Set(['lib/a.ts']),
      new Set(['modules/lead-scoring/index.ts']),
    )
    expect(split.project.map((f) => f.path)).toEqual(['lib/a.ts'])
    expect(split.library.map((f) => f.path)).toEqual(['modules/lead-scoring/index.ts'])
    expect(split.generated.map((f) => f.path)).toEqual(['worker.ts'])
  })

  it('keeps them read-only even where the workspace accepts edits', () => {
    expect(fileEditability('library', { readOnly: false, message: null })).toEqual({
      readOnly: true,
      message: LIBRARY_FILE_MESSAGE,
    })
  })
})
