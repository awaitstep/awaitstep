import { describe, expect, it } from 'vitest'
import type { GeneratedFile } from '@awaitstep/codegen'
import {
  fileOwner,
  newFileError,
  normalizeNewPath,
  splitWorkspaceFiles,
  virtualSeedFiles,
} from '../ide/project'

const bundle: GeneratedFile[] = [
  { path: 'worker.ts', source: '', role: 'entry' },
  { path: 'nodes/Fetch.ts', source: '', role: 'module' },
  { path: 'config/env.ts', source: '', role: 'module' },
  { path: 'package.json', source: '{}', role: 'meta' },
]
const projectPaths = new Set(['config/env.ts', 'package.json'])

describe('splitWorkspaceFiles', () => {
  it('partitions the bundle by ownership, keeping order', () => {
    const split = splitWorkspaceFiles(bundle, projectPaths)
    expect(split.project.map((f) => f.path)).toEqual(['config/env.ts', 'package.json'])
    expect(split.generated.map((f) => f.path)).toEqual(['worker.ts', 'nodes/Fetch.ts'])
    const sets = { projectPaths, storedPaths: projectPaths }
    expect(fileOwner('worker.ts', sets)).toBe('generated')
    expect(fileOwner('config/env.ts', sets)).toBe('project')
  })
})

describe('fileOwner', () => {
  const storedPaths = new Set(['lib/a.ts', 'steps/old.ts'])
  const sets = {
    projectPaths: new Set([...storedPaths, 'handlers.ts', 'steps/k3j9x_a1b2c3.ts']),
    storedPaths,
  }

  it('calls a step source a step, whether or not the editor lists it among project paths', () => {
    expect(fileOwner('steps/k3j9x_a1b2c3.ts', sets)).toBe('step')
    expect(fileOwner('steps/k3j9x_a1b2c3.ts', { ...sets, projectPaths: storedPaths })).toBe('step')
  })

  it('keeps the path of a deleted node a step, never a file to create', () => {
    expect(fileOwner('steps/gone.ts', sets)).toBe('step')
  })

  it('leaves a file stored under steps/ before the folder was reserved a project file', () => {
    expect(fileOwner('steps/old.ts', sets)).toBe('project')
  })

  it('tells project files from the rest of the bundle as before', () => {
    expect(fileOwner('lib/a.ts', sets)).toBe('project')
    expect(fileOwner('handlers.ts', sets)).toBe('project')
    expect(fileOwner('worker.ts', sets)).toBe('generated')
    expect(fileOwner('nodes/a.ts', sets)).toBe('generated')
  })
})

describe('virtualSeedFiles', () => {
  it('surfaces trigger code and dependencies as files until real ones exist', () => {
    const seeds = virtualSeedFiles(
      { triggerCode: '@fetch function handler() {}', dependencies: '{"zod":"^4"}' },
      new Set(),
    )
    expect(seeds.map((f) => `${f.role}:${f.path}`)).toEqual([
      'handlers:handlers.ts',
      'meta:package.json',
    ])
    expect(JSON.parse(seeds[1].source)).toEqual({ dependencies: { zod: '^4' } })
  })

  it('does not offer the annotation file to a project on handler modules', () => {
    expect(
      virtualSeedFiles(
        { triggerCode: '@fetch function handler() {}' },
        new Set(['handlers/fetch.ts']),
      ),
    ).toEqual([])
  })

  it('yields to real project files and skips empty settings', () => {
    expect(
      virtualSeedFiles(
        { triggerCode: 'x', dependencies: '{"zod":"^4"}' },
        new Set(['handlers.ts', 'package.json']),
      ),
    ).toEqual([])
    expect(virtualSeedFiles({ triggerCode: '  ', dependencies: '{}' }, new Set())).toEqual([])
    expect(virtualSeedFiles({ triggerCode: null, dependencies: 'not json' }, new Set())).toEqual([])
  })
})

describe('newFileError', () => {
  const existing = ['worker.ts', 'config/env.ts']

  it('accepts a clean new path and normalizes what the user typed', () => {
    expect(newFileError('services/stripe.ts', existing)).toBeNull()
    expect(normalizeNewPath(' ./services//stripe.ts ')).toBe('services/stripe.ts')
    expect(newFileError(' ./services//stripe.ts ', existing)).toBeNull()
  })

  it('explains empty, invalid, existing and colliding paths', () => {
    expect(newFileError('', existing)).toMatch(/Enter a file path/)
    expect(newFileError('nodes/x.ts', existing)).toMatch(/generated/)
    expect(newFileError('steps/x.ts', existing)).toMatch(/step code/)
    expect(newFileError('config/env.ts', existing)).toMatch(/already exists/)
    expect(newFileError('config/env.js', existing)).toMatch(/would overwrite config\/env.ts/)
    expect(newFileError('notes', existing)).toMatch(/must end in/)
    expect(newFileError('handlers/util.ts', existing)).toBeNull()
    expect(newFileError('handlers/Fetch.ts', existing)).toMatch(/did you mean/)
    expect(newFileError('handlers/fetch.ts', [...existing, 'handlers.ts'])).toMatch(/convert/)
  })
})

describe('storedFiles', () => {
  it('keeps the files with a hash — the ones the file routes store — and nothing generated or projected', async () => {
    const { storedFiles } = await import('../ide/project')
    const stored = storedFiles([
      { path: 'worker.ts', source: '', hash: undefined },
      { path: 'lib/a.ts', source: 'a', hash: 'ha' },
      { path: 'steps/n1.ts', source: 'return 1' },
      { path: 'package.json', source: '{}', hash: 'hp' },
    ])
    expect([...stored.keys()]).toEqual(['lib/a.ts', 'package.json'])
    expect(stored.get('lib/a.ts')).toEqual({ path: 'lib/a.ts', source: 'a', hash: 'ha' })
  })
})
